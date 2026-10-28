import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/db";
import {
  buildSeatingPlan,
  type RoomShape,
  type SeatingGroup,
  type SeatingResult,
  type Strategy,
} from "@/lib/seating-algorithm";

export type Room = {
  id: string;
  block: string;
  room_number: string;
  row_count: number;
  seats_per_row: number;
  capacity: number | null;
  is_active: boolean;
};

export type Exam = {
  id: string;
  name: string;
  exam_date: string;
  session: string;
};

export type ExamGroup = {
  id: string;
  exam_id: string;
  course_id: string;
  batch_id: string;
  courses?: { name: string; code: string } | null;
  batches?: { name: string } | null;
};

export type SeatRow = {
  id: string;
  room_id: string;
  student_id: string;
  row_number: number;
  seat_number: number;
  group_label: string;
  students?: { registration_number: string; roll_number: string | null; name: string } | null;
};

export type SeatRowFull = SeatRow & {
  students?:
    | {
        registration_number: string;
        roll_number: string | null;
        name: string;
        courses?: { code: string; name: string } | null;
        batches?: { name: string } | null;
        sections?: { name: string } | null;
      }
    | null;
};

export type SavedPlan = {
  id: string;
  exam_id: string;
  strategy: string;
  total_students: number;
  rooms_used: number;
  created_at: string;
};

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/* ---------------- rooms ---------------- */

export async function listRooms() {
  return unwrap<Room[]>(
    await supabase.from("rooms").select("*").order("block").order("room_number"),
  );
}

export type RoomInput = {
  block: string;
  room_number: string;
  row_count: number;
  seats_per_row: number;
  is_active: boolean;
};

export async function createRoom(input: RoomInput) {
  const row = unwrap<Room>(await supabase.from("rooms").insert(input).select().single());
  await logActivity({
    entity_type: "room",
    entity_id: row.id,
    entity_label: `${row.block}-${row.room_number}`,
    action: "created",
  });
  return row;
}

export async function updateRoom(id: string, input: RoomInput) {
  const row = unwrap<Room>(
    await supabase.from("rooms").update(input).eq("id", id).select().single(),
  );
  await logActivity({
    entity_type: "room",
    entity_id: id,
    entity_label: `${row.block}-${row.room_number}`,
    action: "updated",
  });
  return row;
}

export async function deleteRoom(id: string) {
  // TC24: Block deletion if room has active seating allocations
  const { count: allocCount, error: allocErr } = await supabase
    .from("seat_allocations")
    .select("id", { count: "exact", head: true })
    .eq("room_id", id);

  if (allocErr) throw new Error(allocErr.message);
  if (allocCount && allocCount > 0) {
    throw new Error(
      `Cannot delete room: This exam hall has ${allocCount} active seating allocation(s) scheduled. Deletion is blocked to preserve active exam seating plans.`,
    );
  }

  // Check if room has invigilation duties assigned
  const { count: dutyCount, error: dutyErr } = await supabase
    .from("professor_duties")
    .select("id", { count: "exact", head: true })
    .eq("room_id", id);

  if (dutyErr) throw new Error(dutyErr.message);
  if (dutyCount && dutyCount > 0) {
    throw new Error(
      `Cannot delete room: This exam hall has ${dutyCount} professor duty assignment(s). Deletion is blocked with dependency warning.`,
    );
  }

  const result = await supabase.from("rooms").delete().eq("id", id);
  if (result.error) throw new Error(result.error.message);
  await logActivity({ entity_type: "room", entity_id: id, action: "deleted" });
}

/* ---------------- exams ---------------- */

export async function listExams() {
  return unwrap<Exam[]>(
    await supabase.from("exams").select("*").order("exam_date", { ascending: false }),
  );
}

export async function getExam(id: string) {
  return unwrap<Exam>(await supabase.from("exams").select("*").eq("id", id).single());
}

export type ExamInput = { name: string; exam_date: string; session: string };

export async function createExam(input: ExamInput) {
  const row = unwrap<Exam>(await supabase.from("exams").insert(input).select().single());
  await logActivity({
    entity_type: "exam",
    entity_id: row.id,
    entity_label: row.name,
    action: "created",
  });
  return row;
}

export async function updateExam(id: string, input: ExamInput) {
  const row = unwrap<Exam>(
    await supabase.from("exams").update(input).eq("id", id).select().single(),
  );
  await logActivity({
    entity_type: "exam",
    entity_id: id,
    entity_label: row.name,
    action: "updated",
  });
  return row;
}

export async function deleteExam(id: string) {
  const result = await supabase.from("exams").delete().eq("id", id);
  if (result.error) throw new Error(result.error.message);
  await logActivity({ entity_type: "exam", entity_id: id, action: "deleted" });
}

/* ---------------- exam groups (which batches sit this exam) ---------------- */

export async function listExamGroups(examId: string) {
  return unwrap<ExamGroup[]>(
    await supabase
      .from("exam_groups")
      .select("*, courses(name, code), batches(name)")
      .eq("exam_id", examId),
  );
}

export async function addExamGroup(input: { exam_id: string; course_id: string; batch_id: string }) {
  return unwrap<ExamGroup>(await supabase.from("exam_groups").insert(input).select().single());
}

export async function removeExamGroup(id: string) {
  const result = await supabase.from("exam_groups").delete().eq("id", id);
  if (result.error) throw new Error(result.error.message);
}

/* ---------------- seating plan ---------------- */

export async function getSeatingPlan(examId: string) {
  const plan = unwrap<SavedPlan[]>(
    await supabase.from("seating_plans").select("*").eq("exam_id", examId).limit(1),
  )[0];
  if (!plan) return null;

  const seats = unwrap<SeatRowFull[]>(
    await supabase
      .from("seat_allocations")
      .select(
        "*, students(registration_number, roll_number, name, courses(code, name), batches(name), sections(name))",
      )
      .eq("plan_id", plan.id)
      .order("room_id")
      .order("row_number")
      .order("seat_number"),
  );
  return { plan, seats };
}

async function loadGroups(examId: string): Promise<SeatingGroup[]> {
  const groups = await listExamGroups(examId);
  const result: SeatingGroup[] = [];
  for (const group of groups) {
    const students = unwrap<
      Array<{
        id: string;
        registration_number: string;
        name: string;
        section_id: string | null;
        sections: { name: string } | null;
      }>
    >(
      await supabase
        .from("students")
        .select("id, registration_number, name, section_id, sections(name)")
        .eq("course_id", group.course_id)
        .eq("batch_id", group.batch_id)
        .eq("status", "active")
        // roll number drives column-wise seating; registration number is the tiebreak
        .order("roll_number", { nullsFirst: false })
        .order("registration_number"),
    );
    const base = `${group.courses?.code ?? "?"} ${group.batches?.name ?? ""}`.trim();
    // Sections of the same paper become separate groups so they can be alternated too.
    const bySection = new Map<string, typeof students>();
    for (const student of students) {
      const key = student.sections?.name ?? "";
      const list = bySection.get(key) ?? [];
      list.push(student);
      bySection.set(key, list);
    }
    for (const [section, list] of [...bySection.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      result.push({
        label: section ? `${base} · ${section}` : base,
        course_code: group.courses?.code ?? "",
        course_name: group.courses?.name ?? "",
        batch_name: group.batches?.name ?? "",
        students: list.map((student) => ({
          id: student.id,
          registration_number: student.registration_number,
          name: student.name,
        })),
      });
    }
  }
  return result;
}

export async function previewSeating(
  examId: string,
  roomIds: string[],
  strategy: Strategy = "alternate",
  fillMode: "pack_rooms" | "balanced" = "pack_rooms",
  alternateOptions?: {
    batchA?: string;
    batchB?: string;
  },
) {
  const [groups, rooms] = await Promise.all([loadGroups(examId), listRooms()]);
  const shapes: RoomShape[] = rooms
    .filter((room) => roomIds.includes(room.id))
    .map((room) => ({
      id: room.id,
      block: room.block,
      room_number: room.room_number,
      row_count: room.row_count,
      seats_per_row: room.seats_per_row,
    }));
  return buildSeatingPlan(groups, shapes, strategy, {
    fillMode,
    alternateBatchA: alternateOptions?.batchA,
    alternateBatchB: alternateOptions?.batchB,
  }) satisfies SeatingResult;
}

export async function saveSeatingPlan(
  examId: string,
  result: SeatingResult,
  strategy: Strategy,
) {
  const { data: sessionData } = await supabase.auth.getSession();

  await supabase.from("seating_plans").delete().eq("exam_id", examId);

  const plan = unwrap<SavedPlan>(
    await supabase
      .from("seating_plans")
      .insert({
        exam_id: examId,
        strategy,
        total_students: result.seated,
        rooms_used: result.rooms.length,
        generated_by: sessionData.session?.user.id ?? null,
      })
      .select()
      .single(),
  );

  const rows = result.rooms.flatMap((room) =>
    room.seats.map((seat) => ({
      plan_id: plan.id,
      room_id: seat.room_id,
      student_id: seat.student_id,
      row_number: seat.row_number,
      seat_number: seat.seat_number,
      group_label: seat.group_label || "",
    })),
  );

  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    const insert = await supabase.from("seat_allocations").insert(chunk);
    if (insert.error) throw new Error(insert.error.message);
  }

  await logActivity({
    entity_type: "seating_plan",
    entity_id: plan.id,
    action: "generated",
    new_value: `${result.seated} students across ${result.rooms.length} rooms`,
  });

  return plan;
}
/** Active student counts for the batches attached to an exam. */
export async function countExamStudents(examId: string) {
  const groups = await listExamGroups(examId);
  const perGroup: Array<{ label: string; count: number }> = [];
  let total = 0;
  for (const group of groups) {
    const { data, error } = await supabase
      .from("students")
      .select("id, sections(name)")
      .eq("course_id", group.course_id)
      .eq("batch_id", group.batch_id)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ sections: { name: string } | null }>;
    total += rows.length;
    const base = `${group.courses?.code ?? "?"} ${group.batches?.name ?? ""}`.trim();
    const bySection = new Map<string, number>();
    for (const row of rows) {
      const key = row.sections?.name ?? "";
      bySection.set(key, (bySection.get(key) ?? 0) + 1);
    }
    for (const [section, count] of [...bySection.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      perGroup.push({ label: section ? `${base} · ${section}` : base, count });
    }
  }
  return { total, perGroup };
}

/* ---------------- category, clash detection & date-driven seating ---------------- */

export function parseExamCategory(rawName: string = ""): { category: string; subjectName: string } {
  const match = (rawName || "").match(/^\[(.*?)\]\s*(.*)$/);
  if (match) {
    return { category: match[1].trim(), subjectName: match[2].trim() || match[1].trim() };
  }
  const lower = (rawName || "").toLowerCase();
  if (lower.includes("mid sem") || lower.includes("mid-sem") || lower.includes("mid term") || lower.includes("mid-term")) {
    return { category: "Mid Semester", subjectName: rawName };
  }
  if (lower.includes("end sem") || lower.includes("end-sem") || lower.includes("end term") || lower.includes("final")) {
    return { category: "End Semester", subjectName: rawName };
  }
  if (lower.includes("supp") || lower.includes("backlog") || lower.includes("re-appear")) {
    return { category: "Supplementary", subjectName: rawName };
  }
  return { category: "General", subjectName: rawName };
}

export function formatExamName(category: string, subjectName: string): string {
  const cat = (category || "").trim();
  const sub = (subjectName || "").trim();
  if (!cat || cat.toLowerCase() === "general") return sub;
  return `[${cat}] ${sub}`;
}

export async function getBatchStudentCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("students")
    .select("batch_id")
    .eq("status", "active")
    .range(0, 49999);
  if (error || !data) {
    return {};
  }
  const counts: Record<string, number> = {};
  for (const s of data) {
    if (s.batch_id) {
      counts[s.batch_id] = (counts[s.batch_id] || 0) + 1;
    }
  }
  return counts;
}

export type ExamDetailed = Exam & {
  category: string;
  subjectName: string;
  groups: ExamGroup[];
  totalStudents: number;
  clashes?: Array<{ batchName: string; otherExamName: string }>;
};

export async function listExamsDetailed(): Promise<ExamDetailed[]> {
  const exams = unwrap<
    Array<
      Exam & {
        exam_groups: Array<{
          id: string;
          exam_id: string;
          course_id: string;
          batch_id: string;
          courses: { name: string; code: string } | null;
          batches: { name: string } | null;
        }>;
      }
    >
  >(
    await supabase
      .from("exams")
      .select("*, exam_groups(*, courses(name, code), batches(name))")
      .order("exam_date", { ascending: false }),
  );

  const batchCounts = await getBatchStudentCounts();

  // Clash map: `${exam_date}_${session.toLowerCase()}_${batch_id}` -> list of { examId, examName, batchName }
  const slotBatchMap = new Map<string, Array<{ examId: string; examName: string; batchName: string }>>();
  for (const exam of exams) {
    const sess = (exam.session || "").toLowerCase();
    for (const g of exam.exam_groups || []) {
      const key = `${exam.exam_date}_${sess}_${g.batch_id}`;
      const list = slotBatchMap.get(key) || [];
      list.push({
        examId: exam.id,
        examName: exam.name,
        batchName: `${g.courses?.code || ""} ${g.batches?.name || ""}`.trim() || g.batches?.name || "Batch",
      });
      slotBatchMap.set(key, list);
    }
  }

  return exams.map((exam) => {
    const { category, subjectName } = parseExamCategory(exam.name);
    let totalStudents = 0;
    const clashes: Array<{ batchName: string; otherExamName: string }> = [];
    const sess = (exam.session || "").toLowerCase();

    for (const g of exam.exam_groups || []) {
      totalStudents += batchCounts[g.batch_id] || 0;
      const key = `${exam.exam_date}_${sess}_${g.batch_id}`;
      const conflictList = slotBatchMap.get(key) || [];
      for (const c of conflictList) {
        if (c.examId !== exam.id) {
          clashes.push({
            batchName: c.batchName,
            otherExamName: c.examName,
          });
        }
      }
    }

    return {
      ...exam,
      category,
      subjectName,
      groups: exam.exam_groups || [],
      totalStudents,
      clashes,
    };
  });
}

export async function checkBatchClashes(
  examDate: string,
  session: string,
  batchIds: string[],
  excludeExamId?: string,
): Promise<Array<{ batchId: string; batchName: string; otherExamName: string; examDate: string; session: string }>> {
  if (!examDate || !session || !batchIds || batchIds.length === 0) return [];

  const sess = session.toLowerCase();
  const allDetailed = await listExamsDetailed();
  const clashes: Array<{ batchId: string; batchName: string; otherExamName: string; examDate: string; session: string }> = [];

  for (const exam of allDetailed) {
    if (exam.exam_date === examDate && exam.session.toLowerCase() === sess && exam.id !== excludeExamId) {
      for (const g of exam.groups) {
        if (batchIds.includes(g.batch_id)) {
          clashes.push({
            batchId: g.batch_id,
            batchName: `${g.courses?.code || ""} ${g.batches?.name || ""}`.trim() || g.batches?.name || "Batch",
            otherExamName: exam.subjectName || exam.name,
            examDate: exam.exam_date,
            session: exam.session,
          });
        }
      }
    }
  }

  return clashes;
}

export async function saveExamWithBatches(input: {
  id?: string;
  category: string;
  subjectName: string;
  exam_date: string;
  session: string;
  batchSelections: Array<{ course_id: string; batch_id: string }>;
}) {
  const formattedName = formatExamName(input.category, input.subjectName);

  let exam: Exam;
  if (input.id) {
    exam = await updateExam(input.id, {
      name: formattedName,
      exam_date: input.exam_date,
      session: input.session,
    });
  } else {
    exam = await createExam({
      name: formattedName,
      exam_date: input.exam_date,
      session: input.session,
    });
  }

  // Sync exam_groups
  const existing = await listExamGroups(exam.id);
  const existingMap = new Map(existing.map((g) => [`${g.course_id}_${g.batch_id}`, g]));

  const newKeySet = new Set(input.batchSelections.map((b) => `${b.course_id}_${b.batch_id}`));

  // Remove groups that were unselected
  for (const g of existing) {
    const key = `${g.course_id}_${g.batch_id}`;
    if (!newKeySet.has(key)) {
      await removeExamGroup(g.id);
    }
  }

  // Insert new groups
  for (const b of input.batchSelections) {
    const key = `${b.course_id}_${b.batch_id}`;
    if (!existingMap.has(key)) {
      await addExamGroup({
        exam_id: exam.id,
        course_id: b.course_id,
        batch_id: b.batch_id,
      });
    }
  }

  return exam;
}

export async function loadGroupsForDateAndSession(examDate: string, session: string): Promise<{
  exams: ExamDetailed[];
  groups: SeatingGroup[];
  totalStudents: number;
  category: string;
  subjects: string[];
}> {
  const allDetailed = await listExamsDetailed();
  const matchedExams = allDetailed.filter(
    (e) => e.exam_date === examDate && (e.session || "").toLowerCase() === (session || "").toLowerCase(),
  );

  if (matchedExams.length === 0) {
    return { exams: [], groups: [], totalStudents: 0, category: "", subjects: [] };
  }

  const detectedCategories = new Set(matchedExams.map((e) => e.category).filter(Boolean));
  const category = detectedCategories.size > 0 ? [...detectedCategories].join(" / ") : "Official Examination";
  const subjects = matchedExams.map((e) => e.subjectName || e.name);

  const combinedGroups: SeatingGroup[] = [];
  let totalStudents = 0;

  for (const exam of matchedExams) {
    for (const group of exam.groups) {
      const students = unwrap<
        Array<{
          id: string;
          registration_number: string;
          name: string;
          section_id: string | null;
          sections: { name: string } | null;
        }>
      >(
        await supabase
          .from("students")
          .select("id, registration_number, name, section_id, sections(name)")
          .eq("course_id", group.course_id)
          .eq("batch_id", group.batch_id)
          .eq("status", "active")
          .order("roll_number", { nullsFirst: false })
          .order("registration_number")
          .range(0, 9999),
      );

      const paperName = exam.subjectName || exam.name;
      const batchName = `${group.courses?.code ?? ""} ${group.batches?.name ?? ""}`.trim();
      const baseLabel = `${paperName} (${batchName})`;

      const bySection = new Map<string, typeof students>();
      for (const student of students) {
        const key = student.sections?.name ?? "";
        const list = bySection.get(key) ?? [];
        list.push(student);
        bySection.set(key, list);
      }

      for (const [section, list] of [...bySection.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        totalStudents += list.length;
        combinedGroups.push({
          label: section ? `${baseLabel} · ${section}` : baseLabel,
          course_code: group.courses?.code ?? "",
          course_name: group.courses?.name ?? "",
          batch_name: group.batches?.name ?? "",
          course_id: group.course_id,
          batch_id: group.batch_id,
          exam_id: exam.id,
          paper_name: paperName,
          students: list.map((student) => ({
            id: student.id,
            registration_number: student.registration_number,
            name: student.name,
          })),
        });
      }
    }
  }

  // Identify distinct batches appearing in this examination sitting
  const distinctBatchMap = new Map<string, {
    key: string;
    batch_id: string;
    course_id: string;
    exam_id: string;
    paper_name: string;
    course_code: string;
    course_name: string;
    batch_name: string;
    label: string;
    count: number;
  }>();

  for (const g of combinedGroups as any[]) {
    const key = `${g.course_id || ""}_${g.batch_id || ""}_${g.exam_id || ""}`;
    if (!distinctBatchMap.has(key)) {
      const cCode = g.course_code || "";
      const bName = g.batch_name || "";
      const pName = g.paper_name || "";
      const namePart = `${cCode} ${bName}`.trim() || bName || "Batch";
      distinctBatchMap.set(key, {
        key,
        batch_id: g.batch_id || "",
        course_id: g.course_id || "",
        exam_id: g.exam_id || "",
        paper_name: pName,
        course_code: cCode,
        course_name: g.course_name || "",
        batch_name: bName,
        label: pName ? `${pName} (${namePart})` : namePart,
        count: 0,
      });
    }
    const item = distinctBatchMap.get(key)!;
    item.count += g.students.length;
  }

  const distinctBatches = Array.from(distinctBatchMap.values()).filter((b) => b.count > 0);

  return {
    exams: matchedExams,
    groups: combinedGroups,
    distinctBatches,
    totalStudents,
    category,
    subjects,
  };
}

export async function previewSeatingForDate(
  examDate: string,
  session: string,
  roomIds: string[],
  strategy: Strategy = "alternate",
  fillMode: "pack_rooms" | "balanced" = "pack_rooms",
  alternateOptions?: {
    batchA?: string;
    batchB?: string;
    interleaveAllBatches?: boolean;
  },
) {
  const [{ groups, distinctBatches }, rooms] = await Promise.all([
    loadGroupsForDateAndSession(examDate, session),
    listRooms(),
  ]);

  // Strategy resolution:
  // When distinctBatches >= 2: Alternates between batches (TC05)
  // When distinctBatches < 2: Alternates with empty buffer desks (TC06)
  const effectiveStrategy = strategy;

  const shapes: RoomShape[] = rooms
    .filter((room) => roomIds.includes(room.id))
    .map((room) => ({
      id: room.id,
      block: room.block,
      room_number: room.room_number,
      row_count: room.row_count,
      seats_per_row: room.seats_per_row,
    }));

  return buildSeatingPlan(groups, shapes, effectiveStrategy, {
    fillMode,
    alternateBatchA: alternateOptions?.batchA,
    alternateBatchB: alternateOptions?.batchB,
    interleaveAllBatches: Boolean(alternateOptions?.interleaveAllBatches || alternateOptions?.batchA === "ALL_BATCHES"),
  }) satisfies SeatingResult;
}

export async function saveSeatingPlanForDate(
  examDate: string,
  session: string,
  result: SeatingResult,
  strategy: Strategy,
) {
  const allDetailed = await listExamsDetailed();
  const matchedExams = allDetailed.filter(
    (e) => e.exam_date === examDate && (e.session || "").toLowerCase() === (session || "").toLowerCase(),
  );

  if (matchedExams.length === 0) {
    throw new Error("No scheduled exams found for this date and session.");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id ?? null;

  for (const exam of matchedExams) {
    await supabase.from("seating_plans").delete().eq("exam_id", exam.id);

    const plan = unwrap<SavedPlan>(
      await supabase
        .from("seating_plans")
        .insert({
          exam_id: exam.id,
          strategy,
          total_students: result.seated,
          rooms_used: result.rooms.length,
          generated_by: userId,
        })
        .select()
        .single(),
    );

    const rows = result.rooms.flatMap((room) =>
      room.seats.map((seat) => ({
        plan_id: plan.id,
        room_id: seat.room_id,
        student_id: seat.student_id,
        row_number: seat.row_number,
        seat_number: seat.seat_number,
        group_label: seat.group_label || "",
      })),
    );

    for (let index = 0; index < rows.length; index += 500) {
      const chunk = rows.slice(index, index + 500);
      const insert = await supabase.from("seat_allocations").insert(chunk);
      if (insert.error) throw new Error(insert.error.message);
    }
  }

  await logActivity({
    entity_type: "seating_plan",
    entity_id: matchedExams[0].id,
    action: "generated",
    new_value: `${result.seated} students seated across ${result.rooms.length} rooms for ${examDate} (${session})`,
  });

  return { success: true, count: result.seated, rooms: result.rooms.length };
}

export async function getSeatingPlanForDate(examDate: string, session: string) {
  const allDetailed = await listExamsDetailed();
  const matchedExams = allDetailed.filter(
    (e) => e.exam_date === examDate && (e.session || "").toLowerCase() === (session || "").toLowerCase(),
  );

  for (const exam of matchedExams) {
    const saved = await getSeatingPlan(exam.id);
    if (saved && saved.plan && saved.seats && saved.seats.length > 0) {
      return saved;
    }
  }
  return null;
}

export type HallRollRange = {
  roomId: string;
  hallNo: string;
  block: string;
  capacity: number;
  totalSeated: number;
  vacant: number;
  batchRanges: Array<{
    groupLabel: string;
    paperName: string;
    batchName: string;
    startRoll: string;
    endRoll: string;
    rangeText: string;
    count: number;
  }>;
};

/**
 * Computes contiguous Roll/Reg Number ranges for each batch inside each examination hall.
 * Used for Notice Board Gate Notices, Door Slips, Attendance Roster summaries, and large-scale Excel exports.
 */
export function computeHallRollRanges(
  displayRooms: Array<{
    room: Room;
    seats: Array<{
      student_id: string;
      group_label?: string;
      student?: any;
      students?: any;
      row_number: number;
      seat_number: number;
    }>;
    capacity: number;
    used: number;
    vacant: number;
  }>,
): HallRollRange[] {
  return displayRooms.map((dr) => {
    const seats = dr.seats || [];
    const capacity = dr.room.row_count * dr.room.seats_per_row;
    const totalSeated = seats.length;
    const vacant = Math.max(0, capacity - totalSeated);

    // Group seats by group_label
    const byGroup = new Map<string, any[]>();
    for (const s of seats) {
      const key = s.group_label || "Exam Paper";
      const list = byGroup.get(key) || [];
      const stud = s.student || s.students;
      if (stud) list.push(stud);
      byGroup.set(key, list);
    }

    const batchRanges: HallRollRange["batchRanges"] = [];

    for (const [groupLabel, students] of byGroup.entries()) {
      if (students.length === 0) continue;

      // Extract roll/reg numbers
      const rollNumbers = students
        .map((st) => (st.roll_number || st.registration_number || "").trim())
        .filter(Boolean);

      // Natural alphanumeric sort
      rollNumbers.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      const startRoll = rollNumbers[0] || "—";
      const endRoll = rollNumbers[rollNumbers.length - 1] || "—";
      const rangeText = startRoll === endRoll ? startRoll : `${startRoll} to ${endRoll}`;

      // Extract paper & batch from groupLabel (e.g. "Data Structures (CSE 2024)")
      const match = groupLabel.match(/^(.*?)\s*\((.*?)\)/);
      const paperName = match ? match[1].trim() : groupLabel;
      const batchName = match ? match[2].trim() : "";

      batchRanges.push({
        groupLabel,
        paperName,
        batchName,
        startRoll,
        endRoll,
        rangeText,
        count: students.length,
      });
    }

    return {
      roomId: dr.room.id,
      hallNo: dr.room.room_number,
      block: dr.room.block,
      capacity,
      totalSeated,
      vacant,
      batchRanges,
    };
  });
}

