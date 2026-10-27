import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "./db";

export type ExcelStudentRow = {
  registrationNumber: string;
  rollNumber: string;
  name: string;
  email?: string;
  section: string;
  rowNumber: number;
};

export type FieldChange = { field: "name" | "roll_number" | "section" | "email"; from: string; to: string };

export type SyncEntry = {
  key: string;
  registrationNumber: string;
  name: string;
  rollNumber: string;
  email?: string;
  section: string;
  kind: "new" | "changed" | "unchanged";
  changes: FieldChange[];
  studentId?: string;
};

export type SyncPreview = {
  fileName: string;
  totalRows: number;
  invalidRows: Array<{ rowNumber: number; reason: string }>;
  duplicateRows: Array<{ rowNumber: number; registrationNumber: string }>;
  entries: SyncEntry[];
  newSections: string[];
};

const HEADER_ALIASES: Record<string, keyof Omit<ExcelStudentRow, "rowNumber">> = {
  "registration number": "registrationNumber",
  "registration no": "registrationNumber",
  "reg number": "registrationNumber",
  "reg no": "registrationNumber",
  regno: "registrationNumber",
  registrationnumber: "registrationNumber",
  "roll number": "rollNumber",
  "roll no": "rollNumber",
  rollno: "rollNumber",
  rollnumber: "rollNumber",
  "student name": "name",
  name: "name",
  studentname: "name",
  email: "email",
  "student email": "email",
  "email id": "email",
  emailid: "email",
  "email address": "email",
  mail: "email",
  section: "section",
  "section name": "section",
};

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[._-]/g, " ").replace(/\s+/g, " ").trim();
}

export function matchStudentField(rawHeader: string): keyof Omit<ExcelStudentRow, "rowNumber"> | undefined {
  const norm = normalizeHeader(rawHeader);
  if (HEADER_ALIASES[norm]) return HEADER_ALIASES[norm];

  if (
    norm.includes("email") ||
    norm.includes("e mail") ||
    norm.includes("mail id") ||
    norm.includes("mailid") ||
    norm === "mail" ||
    norm.includes("gmail")
  ) {
    return "email";
  }

  if (
    norm.includes("registration") ||
    norm.includes("enroll") ||
    norm.startsWith("reg") ||
    norm.includes("admission no")
  ) {
    return "registrationNumber";
  }

  if (norm.includes("roll")) {
    return "rollNumber";
  }

  if (norm.includes("name") || norm === "student" || norm === "candidate") {
    return "name";
  }

  if (norm.includes("section") || norm === "sec" || norm.includes("class")) {
    return "section";
  }

  return undefined;
}

export function normalizeRegistrationNumber(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeSectionName(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  if (/^[a-z]$/i.test(cleaned)) return `Section ${cleaned.toUpperCase()}`;
  return cleaned.replace(/^section\s+/i, "Section ").replace(/^(?!Section)/, "Section ").trim();
}

export async function parseStudentWorkbook(file: File): Promise<ExcelStudentRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "" });

  return raw.map((record, index) => {
    const mapped: Record<string, string> = {};
    let fallbackEmail: string | undefined = undefined;

    for (const [header, value] of Object.entries(record)) {
      const text = String(value ?? "").trim();
      if (!text) continue;

      const field = matchStudentField(header);
      if (field) {
        mapped[field] = text;
      } else if (!fallbackEmail && text.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        fallbackEmail = text.toLowerCase();
      }
    }

    const emailVal = (mapped["email"] || fallbackEmail || "").trim().toLowerCase();

    return {
      registrationNumber: normalizeRegistrationNumber(mapped["registrationNumber"] ?? ""),
      rollNumber: mapped["rollNumber"] ?? "",
      name: (mapped["name"] ?? "").replace(/\s+/g, " ").trim(),
      email: emailVal || undefined,
      section: normalizeSectionName(mapped["section"] ?? ""),
      rowNumber: index + 2,
    };
  });
}

export async function buildSyncPreview(params: {
  file: File;
  batchId: string;
}): Promise<SyncPreview> {
  const rows = await parseStudentWorkbook(params.file);

  const invalidRows: SyncPreview["invalidRows"] = [];
  const duplicateRows: SyncPreview["duplicateRows"] = [];
  const seen = new Set<string>();
  const validRows: ExcelStudentRow[] = [];

  for (const row of rows) {
    if (!row.registrationNumber) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: "Missing registration number" });
      continue;
    }
    if (!row.name) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: "Missing student name" });
      continue;
    }
    if (!row.email || !row.email.includes("@")) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: "Missing or invalid email address" });
      continue;
    }
    if (seen.has(row.registrationNumber)) {
      duplicateRows.push({ rowNumber: row.rowNumber, registrationNumber: row.registrationNumber });
      continue;
    }
    seen.add(row.registrationNumber);
    validRows.push(row);
  }

  const { data: existing, error } = await supabase
    .from("students")
    .select("id, registration_number, roll_number, name, email, section_id, sections(name)")
    .in("registration_number", validRows.map((row) => row.registrationNumber));
  if (error) throw new Error(error.message);

  const { data: sectionRows, error: sectionError } = await supabase
    .from("sections")
    .select("id, name")
    .eq("batch_id", params.batchId);
  if (sectionError) throw new Error(sectionError.message);

  const existingByReg = new Map(
    (existing ?? []).map((row) => [
      row.registration_number,
      {
        id: row.id,
        name: row.name,
        rollNumber: row.roll_number ?? "",
        email: row.email ?? "",
        sectionName:
          (row.sections as { name: string } | null)?.name ?? "",
      },
    ]),
  );

  const knownSections = new Set((sectionRows ?? []).map((row) => row.name));
  const newSections = new Set<string>();

  const entries: SyncEntry[] = validRows.map((row) => {
    if (row.section && !knownSections.has(row.section)) newSections.add(row.section);
    const current = existingByReg.get(row.registrationNumber);

    if (!current) {
      return {
        key: row.registrationNumber,
        registrationNumber: row.registrationNumber,
        name: row.name,
        rollNumber: row.rollNumber,
        email: row.email,
        section: row.section,
        kind: "new",
        changes: [],
      };
    }

    const changes: FieldChange[] = [];
    if (current.name !== row.name) changes.push({ field: "name", from: current.name, to: row.name });
    if (row.email && current.email !== row.email)
      changes.push({ field: "email", from: current.email || "—", to: row.email });
    if (current.rollNumber !== row.rollNumber && row.rollNumber)
      changes.push({ field: "roll_number", from: current.rollNumber || "—", to: row.rollNumber });
    if (row.section && current.sectionName !== row.section)
      changes.push({ field: "section", from: current.sectionName || "—", to: row.section });

    return {
      key: row.registrationNumber,
      registrationNumber: row.registrationNumber,
      name: row.name,
      rollNumber: row.rollNumber,
      email: row.email,
      section: row.section,
      kind: changes.length ? "changed" : "unchanged",
      changes,
      studentId: current.id,
    };
  });

  return {
    fileName: params.file.name,
    totalRows: rows.length,
    invalidRows,
    duplicateRows,
    entries,
    newSections: [...newSections].sort(),
  };
}

async function ensureSections(batchId: string, names: string[]) {
  const map = new Map<string, string>();
  const { data: existing, error } = await supabase
    .from("sections")
    .select("id, name")
    .eq("batch_id", batchId);
  if (error) throw new Error(error.message);
  for (const row of existing ?? []) map.set(row.name, row.id);

  const missing = names.filter((name) => name && !map.has(name));
  if (missing.length) {
    const { data: inserted, error: insertError } = await supabase
      .from("sections")
      .insert(missing.map((name) => ({ batch_id: batchId, name })))
      .select("id, name");
    if (insertError) throw new Error(insertError.message);
    for (const row of inserted ?? []) {
      map.set(row.name, row.id);
      await logActivity({
        entity_type: "section",
        entity_id: row.id,
        entity_label: row.name,
        action: "auto-created by import",
      });
    }
  }
  return map;
}

export type ApplyResult = { created: number; updated: number; skipped: number };

export async function applySyncPreview(params: {
  preview: SyncPreview;
  courseId: string;
  batchId: string;
  approvedKeys: Set<string>;
}): Promise<ApplyResult> {
  const { preview, courseId, batchId, approvedKeys } = params;

  const toCreate = preview.entries.filter(
    (entry) => entry.kind === "new" && approvedKeys.has(entry.key),
  );
  const toUpdate = preview.entries.filter(
    (entry) => entry.kind === "changed" && approvedKeys.has(entry.key),
  );

  const sectionNames = [...new Set([...toCreate, ...toUpdate].map((entry) => entry.section))].filter(
    Boolean,
  );
  const sectionMap = await ensureSections(batchId, sectionNames);

  let created = 0;
  if (toCreate.length) {
    const payload = toCreate.map((entry) => ({
      registration_number: entry.registrationNumber,
      roll_number: entry.rollNumber || null,
      name: entry.name,
      email: entry.email || null,
      course_id: courseId,
      batch_id: batchId,
      section_id: entry.section ? (sectionMap.get(entry.section) ?? null) : null,
      status: "active",
    }));

    for (let index = 0; index < payload.length; index += 200) {
      const chunk = payload.slice(index, index + 200);
      const { data, error } = await supabase
        .from("students")
        .upsert(chunk, { onConflict: "registration_number" })
        .select("id");
      if (error) throw new Error(error.message);
      created += data?.length ?? 0;
    }
  }

  let updated = 0;
  for (const entry of toUpdate) {
    if (!entry.studentId) continue;
    const patch: { name: string; roll_number?: string; email?: string | null; section_id?: string | null } = {
      name: entry.name,
    };
    if (entry.rollNumber) patch.roll_number = entry.rollNumber;
    if (entry.email !== undefined) patch.email = entry.email || null;
    if (entry.section) patch.section_id = sectionMap.get(entry.section) ?? null;

    const { error } = await supabase.from("students").update(patch).eq("id", entry.studentId);
    if (error) throw new Error(error.message);
    updated += 1;

    for (const change of entry.changes) {
      await logActivity({
        entity_type: "student",
        entity_id: entry.studentId,
        entity_label: entry.registrationNumber,
        action: change.field === "section" ? "section changed by import" : "updated by import",
        field_name: change.field,
        old_value: change.from,
        new_value: change.to,
      });
    }
  }

  const skipped = preview.totalRows - created - updated;

  const { data: sessionData } = await supabase.auth.getSession();
  await supabase.from("import_logs").insert({
    import_type: "students",
    file_name: preview.fileName,
    course_id: courseId,
    batch_id: batchId,
    total_rows: preview.totalRows,
    created_count: created,
    updated_count: updated,
    skipped_count: Math.max(skipped, 0),
    performed_by: sessionData.session?.user.id ?? null,
  });

  return { created, updated, skipped: Math.max(skipped, 0) };
}