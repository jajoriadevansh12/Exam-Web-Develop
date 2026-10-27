import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/db";

export type RoomConflictType = "none" | "already_exists" | "duplicate_in_file" | "invalid";

export type ParsedRoom = {
  key: string;
  building: string;
  floor: string;
  classroom: string;
  rowCount: number;
  seatsPerRow: number;
  capacity: number;
  block: string;
  roomNumber: string;
  isValid: boolean;
  status: RoomConflictType;
  error?: string;
  existingRoom?: {
    id: string;
    block: string;
    room_number: string;
    row_count: number;
    seats_per_row: number;
    capacity: number | null;
  };
};

export type BuildingSummary = {
  building: string;
  roomCount: number;
  totalSeats: number;
  floors: string[];
};

export type RoomImportPreview = {
  fileName: string;
  totalRows: number;
  rooms: ParsedRoom[];
  validCount: number;
  totalSeats: number;
  uniqueBuildings: string[];
  newRooms: ParsedRoom[];
  existingRooms: ParsedRoom[];
  duplicateRooms: ParsedRoom[];
  invalidRooms: ParsedRoom[];
  hasConflicts: boolean;
  conflictCount: number;
  buildingsSummary: BuildingSummary[];
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[._-]/g, " ").replace(/\s+/g, " ").trim();
}

function matchRoomField(rawHeader: string): string | undefined {
  const norm = normalizeHeader(rawHeader);

  if (
    norm.includes("building") ||
    norm === "block" ||
    norm === "bldg" ||
    norm.includes("complex") ||
    norm.includes("wing")
  ) {
    return "building";
  }

  if (norm.includes("floor") || norm === "level" || norm === "flr") {
    return "floor";
  }

  if (
    norm.includes("classroom") ||
    norm.includes("room") ||
    norm.includes("hall") ||
    norm === "class" ||
    norm === "room no" ||
    norm === "room number" ||
    norm === "hall no"
  ) {
    return "classroom";
  }

  if (
    norm === "rows" ||
    norm === "row" ||
    norm.includes("row count") ||
    norm.includes("no of rows") ||
    norm.includes("no. of rows") ||
    norm === "total rows"
  ) {
    return "rows";
  }

  if (
    norm.includes("seats per row") ||
    norm.includes("seats/row") ||
    norm.includes("seats_per_row") ||
    norm.includes("seat per row") ||
    norm.includes("seats in row") ||
    norm.includes("cols") ||
    norm.includes("columns") ||
    norm === "seats per col"
  ) {
    return "seatsPerRow";
  }

  if (
    norm.includes("capacity") ||
    norm.includes("total capacity") ||
    norm.includes("total seats") ||
    norm === "seats" ||
    norm === "total" ||
    norm.includes("max capacity")
  ) {
    return "capacity";
  }

  return undefined;
}

export async function parseRoomsWorkbook(
  file: File,
  includeFloorInBlock = true,
  existingRooms: Array<{
    id?: string;
    block: string;
    room_number: string;
    row_count: number;
    seats_per_row: number;
    capacity?: number | null;
  }> = [],
): Promise<RoomImportPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "" });

  const existingMap = new Map<string, (typeof existingRooms)[0]>();
  for (const r of existingRooms) {
    const k = `${r.block.trim().toLowerCase()}::${r.room_number.trim().toLowerCase()}`;
    existingMap.set(k, r);
  }

  const rooms: ParsedRoom[] = [];
  const seenKeys = new Set<string>();

  raw.forEach((record, index) => {
    const mapped: Record<string, string> = {};

    for (const [header, value] of Object.entries(record)) {
      const text = String(value ?? "").trim();
      if (!text) continue;
      const field = matchRoomField(header);
      if (field) mapped[field] = text;
    }

    const building = (mapped["building"] || "Main").trim();
    const floor = (mapped["floor"] || "").trim();
    const classroom = (mapped["classroom"] || "").trim();

    let rowCount = parseInt(mapped["rows"] || "0", 10);
    let seatsPerRow = parseInt(mapped["seatsPerRow"] || "0", 10);
    let capacity = parseInt(mapped["capacity"] || "0", 10);

    // Smart layout calculations
    if (rowCount > 0 && seatsPerRow > 0) {
      capacity = rowCount * seatsPerRow;
    } else if (capacity > 0 && rowCount > 0) {
      seatsPerRow = Math.max(1, Math.ceil(capacity / rowCount));
    } else if (capacity > 0 && seatsPerRow > 0) {
      rowCount = Math.max(1, Math.ceil(capacity / seatsPerRow));
    } else if (capacity > 0) {
      seatsPerRow = 6;
      rowCount = Math.max(1, Math.ceil(capacity / 6));
      capacity = rowCount * seatsPerRow;
    } else {
      rowCount = 5;
      seatsPerRow = 6;
      capacity = 30;
    }

    // Clamp row_count and seats_per_row to reasonable bounds (max 30)
    rowCount = Math.min(Math.max(1, rowCount), 30);
    seatsPerRow = Math.min(Math.max(1, seatsPerRow), 30);
    capacity = rowCount * seatsPerRow;

    const block = includeFloorInBlock && floor
      ? `${building} (Floor ${floor})`
      : building;
    const roomNumber = classroom;

    const isValid = Boolean(roomNumber && capacity > 0);
    const key = `${block}::${roomNumber}`.toLowerCase();

    if (!isValid) {
      rooms.push({
        key: `row-${index + 2}`,
        building,
        floor,
        classroom: classroom || `Row ${index + 2}`,
        rowCount,
        seatsPerRow,
        capacity,
        block,
        roomNumber: classroom,
        isValid: false,
        status: "invalid",
        error: "Missing classroom/room number or invalid capacity",
      });
      return;
    }

    if (seenKeys.has(key)) {
      rooms.push({
        key: `row-${index + 2}`,
        building,
        floor,
        classroom,
        rowCount,
        seatsPerRow,
        capacity,
        block,
        roomNumber,
        isValid: false,
        status: "duplicate_in_file",
        error: `Duplicate classroom '${roomNumber}' in ${block} within this Excel sheet`,
      });
      return;
    }

    seenKeys.add(key);

    const existing = existingMap.get(key);
    if (existing) {
      rooms.push({
        key: `row-${index + 2}`,
        building,
        floor,
        classroom,
        rowCount,
        seatsPerRow,
        capacity,
        block,
        roomNumber,
        isValid: true,
        status: "already_exists",
        existingRoom: {
          id: existing.id ?? "",
          block: existing.block,
          room_number: existing.room_number,
          row_count: existing.row_count,
          seats_per_row: existing.seats_per_row,
          capacity: existing.capacity ?? existing.row_count * existing.seats_per_row,
        },
      });
    } else {
      rooms.push({
        key: `row-${index + 2}`,
        building,
        floor,
        classroom,
        rowCount,
        seatsPerRow,
        capacity,
        block,
        roomNumber,
        isValid: true,
        status: "none",
      });
    }
  });

  const validRooms = rooms.filter((r) => r.isValid);
  const totalSeats = validRooms.reduce((sum, r) => sum + r.capacity, 0);
  const uniqueBuildings = [...new Set(validRooms.map((r) => r.building))].sort();

  const newRooms = rooms.filter((r) => r.isValid && r.status === "none");
  const existingRoomsInFile = rooms.filter((r) => r.isValid && r.status === "already_exists");
  const duplicateRooms = rooms.filter((r) => r.status === "duplicate_in_file");
  const invalidRooms = rooms.filter((r) => r.status === "invalid");

  const hasConflicts = existingRoomsInFile.length > 0 || duplicateRooms.length > 0 || invalidRooms.length > 0;
  const conflictCount = existingRoomsInFile.length + duplicateRooms.length + invalidRooms.length;

  const buildingMap = new Map<string, { count: number; seats: number; floors: Set<string> }>();
  for (const r of validRooms) {
    const b = r.building || "Main";
    const cur = buildingMap.get(b) || { count: 0, seats: 0, floors: new Set<string>() };
    cur.count += 1;
    cur.seats += r.capacity;
    if (r.floor) cur.floors.add(r.floor);
    buildingMap.set(b, cur);
  }

  const buildingsSummary: BuildingSummary[] = Array.from(buildingMap.entries()).map(([building, data]) => ({
    building,
    roomCount: data.count,
    totalSeats: data.seats,
    floors: Array.from(data.floors).sort(),
  }));

  return {
    fileName: file.name,
    totalRows: raw.length,
    rooms,
    validCount: validRooms.length,
    totalSeats,
    uniqueBuildings,
    newRooms,
    existingRooms: existingRoomsInFile,
    duplicateRooms,
    invalidRooms,
    hasConflicts,
    conflictCount,
    buildingsSummary,
  };
}

export async function applyRoomsImport(
  rooms: ParsedRoom[],
  options?: { updateExisting?: boolean },
): Promise<{
  inserted: number;
  totalSeats: number;
}> {
  const updateExisting = options?.updateExisting ?? true;
  const target = rooms.filter((r) => r.isValid && (updateExisting || r.status !== "already_exists"));
  if (target.length === 0) return { inserted: 0, totalSeats: 0 };

  const payload = target.map((r) => ({
    block: r.block,
    room_number: r.roomNumber,
    row_count: r.rowCount,
    seats_per_row: r.seatsPerRow,
    is_active: true,
  }));

  let inserted = 0;
  for (let i = 0; i < payload.length; i += 100) {
    const chunk = payload.slice(i, i + 100);
    const { data, error } = await supabase
      .from("rooms")
      .upsert(chunk, { onConflict: "block,room_number" })
      .select("id");
    if (error) throw new Error(error.message);
    inserted += data?.length ?? chunk.length;
  }

  await logActivity({
    entity_type: "room",
    action: "excel_import",
    entity_label: `${inserted} halls imported (${updateExisting ? "updates allowed" : "new only"})`,
  });

  const totalSeats = target.reduce((sum, r) => sum + r.capacity, 0);
  return { inserted, totalSeats };
}

export function downloadRoomsTemplate() {
  const rows = [
    {
      "Building": "Main Block",
      "Floor": "1st Floor",
      "Classroom": "101",
      "Rows": 6,
      "Seats per Row": 6,
      "Total Capacity": 36,
    },
    {
      "Building": "Main Block",
      "Floor": "1st Floor",
      "Classroom": "102",
      "Rows": 6,
      "Seats per Row": 6,
      "Total Capacity": 36,
    },
    {
      "Building": "Science Wing",
      "Floor": "2nd Floor",
      "Classroom": "201",
      "Rows": 7,
      "Seats per Row": 6,
      "Total Capacity": 42,
    },
    {
      "Building": "Engineering Block",
      "Floor": "Ground Floor",
      "Classroom": "G-05",
      "Rows": 8,
      "Seats per Row": 8,
      "Total Capacity": 64,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 10 },
    { wch: 16 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Exam Halls");
  XLSX.writeFile(wb, "exam-halls-template.xlsx");
}
