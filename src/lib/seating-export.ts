import * as XLSX from "xlsx";

import type { Room, SeatRowFull } from "@/lib/seating";

/**
 * Builds one worksheet per course (B.Tech, B.Com, …) with room number, roll no,
 * section and name, then downloads a single workbook.
 */
export function exportSeatingWorkbook(
  seats: SeatRowFull[],
  rooms: Map<string, Room>,
  examLabel: string,
) {
  const byCourse = new Map<string, SeatRowFull[]>();
  for (const seat of seats) {
    const key = seat.students?.courses?.code ?? "Unassigned";
    const list = byCourse.get(key) ?? [];
    list.push(seat);
    byCourse.set(key, list);
  }

  const book = XLSX.utils.book_new();
  for (const [course, list] of byCourse) {
    const rows = list
      .slice()
      .sort((a, b) => (a.students?.roll_number ?? "").localeCompare(b.students?.roll_number ?? ""))
      .map((seat) => {
        const room = rooms.get(seat.room_id);
        return {
          "Room No": room ? `${room.block}/${room.room_number}` : "—",
          Row: seat.row_number,
          Seat: seat.seat_number,
          "Roll No": seat.students?.roll_number ?? "",
          "Registration No": seat.students?.registration_number ?? "",
          Name: seat.students?.name ?? "",
          Section: seat.students?.sections?.name ?? "—",
          Course: seat.students?.courses?.name ?? course,
          Batch: seat.students?.batches?.name ?? "",
        };
      });
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [
      { wch: 12 },
      { wch: 6 },
      { wch: 6 },
      { wch: 14 },
      { wch: 18 },
      { wch: 26 },
      { wch: 10 },
      { wch: 24 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(book, sheet, course.slice(0, 28) || "Sheet");
  }

  XLSX.writeFile(book, `seating-${examLabel}.xlsx`);
}

/** Downloads one workbook per course instead of a single multi-sheet file. */
export function exportSeatingPerCourse(
  seats: SeatRowFull[],
  rooms: Map<string, Room>,
  examLabel: string,
) {
  const courses = new Set(seats.map((seat) => seat.students?.courses?.code ?? "Unassigned"));
  for (const course of courses) {
    const subset = seats.filter(
      (seat) => (seat.students?.courses?.code ?? "Unassigned") === course,
    );
    exportSeatingWorkbook(subset, rooms, `${course}-${examLabel}`);
  }
}
