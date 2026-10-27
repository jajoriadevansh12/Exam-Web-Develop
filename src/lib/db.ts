import { supabase } from "@/integrations/supabase/client";

export const UNIVERSITY_NAME = "XYZ University";

export type Course = {
  id: string;
  name: string;
  code: string;
  created_at: string;
};

export type Batch = {
  id: string;
  course_id: string;
  name: string;
  start_year: number;
  end_year: number;
  courses?: { name: string; code: string } | null;
};

export type Section = {
  id: string;
  batch_id: string;
  name: string;
  batches?: { name: string; courses?: { code: string } | null } | null;
};

export type Student = {
  id: string;
  registration_number: string;
  roll_number: string | null;
  name: string;
  email?: string | null;
  course_id: string;
  batch_id: string;
  section_id: string | null;
  status: string;
  courses?: { name: string; code: string } | null;
  batches?: { name: string } | null;
  sections?: { name: string } | null;
};

export type ActivityLog = {
  id: string;
  entity_type: string;
  entity_label: string | null;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

export type ImportLog = {
  id: string;
  import_type: string;
  file_name: string | null;
  total_rows: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  created_at: string;
};

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/* ---------------- courses ---------------- */

export async function listCourses() {
  return unwrap<Course[]>(
    await supabase.from("courses").select("*").order("name", { ascending: true }),
  );
}

export async function createCourse(input: { name: string; code: string }) {
  const row = unwrap<Course>(
    await supabase.from("courses").insert(input).select().single(),
  );
  await logActivity({ entity_type: "course", entity_id: row.id, entity_label: row.code, action: "created" });
  return row;
}

export async function updateCourse(id: string, input: { name: string; code: string }) {
  const row = unwrap<Course>(
    await supabase.from("courses").update(input).eq("id", id).select().single(),
  );
  await logActivity({ entity_type: "course", entity_id: id, entity_label: row.code, action: "updated" });
  return row;
}

export async function deleteCourse(id: string, cascade = true) {
  if (cascade) {
    // 1. Check if students exist
    const { count } = await supabase.from("students").select("id", { count: "exact", head: true }).eq("course_id", id);
    if (count && count > 0) {
      throw new Error(`Cannot delete course because ${count} students are still enrolled in it.`);
    }
    // 2. Clean up linked exam groups, subjects, and batch sections
    await supabase.from("exam_groups").delete().eq("course_id", id);
    await supabase.from("subjects").delete().eq("course_id", id);
    const { data: bList } = await supabase.from("batches").select("id").eq("course_id", id);
    for (const b of bList || []) {
      await supabase.from("sections").delete().eq("batch_id", b.id);
    }
    await supabase.from("batches").delete().eq("course_id", id);
  }
  const result = await supabase.from("courses").delete().eq("id", id);
  if (result.error) throw new Error(result.error.message);
  await logActivity({ entity_type: "course", entity_id: id, action: "deleted" });
}

/* ---------------- batches ---------------- */

export async function listBatches(courseId?: string) {
  let query = supabase
    .from("batches")
    .select("*, courses(name, code)")
    .order("start_year", { ascending: false });
  if (courseId) query = query.eq("course_id", courseId);
  return unwrap<Batch[]>(await query);
}

export async function createBatch(input: {
  course_id: string;
  name: string;
  start_year: number;
  end_year: number;
}) {
  const row = unwrap<Batch>(await supabase.from("batches").insert(input).select().single());
  await logActivity({ entity_type: "batch", entity_id: row.id, entity_label: row.name, action: "created" });
  return row;
}

export async function updateBatch(
  id: string,
  input: { course_id: string; name: string; start_year: number; end_year: number },
) {
  const row = unwrap<Batch>(
    await supabase.from("batches").update(input).eq("id", id).select().single(),
  );
  await logActivity({ entity_type: "batch", entity_id: id, entity_label: row.name, action: "updated" });
  return row;
}

export async function deleteBatch(id: string, cascade = true) {
  if (cascade) {
    const { count } = await supabase.from("students").select("id", { count: "exact", head: true }).eq("batch_id", id);
    if (count && count > 0) {
      throw new Error(`Cannot delete batch because ${count} students are still enrolled in it.`);
    }
    await supabase.from("exam_groups").delete().eq("batch_id", id);
    await supabase.from("sections").delete().eq("batch_id", id);
  }
  const result = await supabase.from("batches").delete().eq("id", id);
  if (result.error) throw new Error(result.error.message);
  await logActivity({ entity_type: "batch", entity_id: id, action: "deleted" });
}

/* ---------------- sections ---------------- */

export async function listSections(batchId?: string) {
  let query = supabase
    .from("sections")
    .select("*, batches(name, courses(code))")
    .order("name", { ascending: true });
  if (batchId) query = query.eq("batch_id", batchId);
  return unwrap<Section[]>(await query);
}

export async function createSection(input: { batch_id: string; name: string }) {
  const row = unwrap<Section>(await supabase.from("sections").insert(input).select().single());
  await logActivity({ entity_type: "section", entity_id: row.id, entity_label: row.name, action: "created" });
  return row;
}

export async function updateSection(id: string, input: { batch_id: string; name: string }) {
  const row = unwrap<Section>(
    await supabase.from("sections").update(input).eq("id", id).select().single(),
  );
  await logActivity({ entity_type: "section", entity_id: id, entity_label: row.name, action: "updated" });
  return row;
}

export async function deleteSection(id: string) {
  const { count } = await supabase.from("students").select("id", { count: "exact", head: true }).eq("section_id", id);
  if (count && count > 0) {
    throw new Error(`Cannot delete section because ${count} students are currently assigned to it.`);
  }
  const result = await supabase.from("sections").delete().eq("id", id);
  if (result.error) throw new Error(result.error.message);
  await logActivity({ entity_type: "section", entity_id: id, action: "deleted" });
}

/* ---------------- students ---------------- */

export type StudentQuery = {
  search?: string | undefined;
  courseId?: string | undefined;
  batchId?: string | undefined;
  sectionId?: string | undefined;
  status?: string | undefined;
  page: number;
  pageSize: number;
};

export async function listStudents(params: StudentQuery) {
  const from = (params.page - 1) * params.pageSize;
  let query = supabase
    .from("students")
    .select("*, courses(name, code), batches(name), sections(name)", { count: "exact" })
    .order("registration_number", { ascending: true })
    .range(from, from + params.pageSize - 1);

  if (params.courseId) query = query.eq("course_id", params.courseId);
  if (params.batchId) query = query.eq("batch_id", params.batchId);
  if (params.sectionId) query = query.eq("section_id", params.sectionId);
  if (params.status) query = query.eq("status", params.status);
  if (params.search) {
    const term = `%${params.search.trim()}%`;
    query = query.or(
      `registration_number.ilike.${term},roll_number.ilike.${term},name.ilike.${term},email.ilike.${term}`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as Student[], total: count ?? 0 };
}

export type UpdateStudentInput = {
  registration_number?: string;
  name?: string;
  roll_number?: string | null;
  email?: string | null;
  course_id?: string;
  batch_id?: string;
  section_id?: string | null;
  status?: string;
};

export async function updateStudent(
  id: string,
  input: UpdateStudentInput,
  previous: Student,
) {
  const row = unwrap<Student>(
    await supabase.from("students").update(input).eq("id", id).select().single(),
  );

  const changes: Array<{ field: string; from: string | null; to: string | null }> = [];
  if (input.name !== undefined && previous.name !== input.name)
    changes.push({ field: "name", from: previous.name, to: input.name });
  if (input.email !== undefined && (previous.email ?? "") !== (input.email ?? ""))
    changes.push({ field: "email", from: previous.email ?? null, to: input.email ?? null });
  if (input.registration_number !== undefined && previous.registration_number !== input.registration_number)
    changes.push({ field: "registration_number", from: previous.registration_number, to: input.registration_number });
  if (input.roll_number !== undefined && (previous.roll_number ?? "") !== (input.roll_number ?? ""))
    changes.push({ field: "roll_number", from: previous.roll_number, to: input.roll_number });
  if (input.section_id !== undefined && previous.section_id !== input.section_id)
    changes.push({ field: "section_id", from: previous.section_id, to: input.section_id });
  if (input.batch_id !== undefined && previous.batch_id !== input.batch_id)
    changes.push({ field: "batch_id", from: previous.batch_id, to: input.batch_id });
  if (input.course_id !== undefined && previous.course_id !== input.course_id)
    changes.push({ field: "course_id", from: previous.course_id, to: input.course_id });
  if (input.status !== undefined && previous.status !== input.status)
    changes.push({ field: "status", from: previous.status, to: input.status });

  for (const change of changes) {
    await logActivity({
      entity_type: "student",
      entity_id: id,
      entity_label: input.registration_number ?? previous.registration_number,
      action: "updated",
      field_name: change.field,
      old_value: change.from,
      new_value: change.to,
    });
  }
  return row;
}

export async function deleteStudent(id: string, registrationNumber: string) {
  const result = await supabase.from("students").delete().eq("id", id);
  if (result.error) throw new Error(result.error.message);
  await logActivity({
    entity_type: "student",
    entity_id: id,
    entity_label: registrationNumber,
    action: "deleted",
  });
}

/* ---------------- logs & dashboard ---------------- */

export async function logActivity(entry: {
  entity_type: string;
  entity_id?: string;
  entity_label?: string | null;
  action: string;
  field_name?: string;
  old_value?: string | null;
  new_value?: string | null;
}) {
  const { data } = await supabase.auth.getSession();
  await supabase.from("activity_logs").insert({
    ...entry,
    performed_by: data.session?.user.id ?? null,
  });
}

export async function listActivityLogs(params: { entityType?: string; page: number; pageSize: number }) {
  const from = (params.page - 1) * params.pageSize;
  let query = supabase
    .from("activity_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + params.pageSize - 1);
  if (params.entityType) query = query.eq("entity_type", params.entityType);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as ActivityLog[], total: count ?? 0 };
}

export async function listImportLogs(limit = 10) {
  return unwrap<ImportLog[]>(
    await supabase
      .from("import_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
  );
}

export async function getDashboardStats() {
  const [students, courses, batches, sections, activeStudents, imports] = await Promise.all([
    supabase.from("students").select("id", { count: "exact", head: true }),
    supabase.from("courses").select("id", { count: "exact", head: true }),
    supabase.from("batches").select("id", { count: "exact", head: true }),
    supabase.from("sections").select("id", { count: "exact", head: true }),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "active"),
    listImportLogs(5),
  ]);

  return {
    students: students.count ?? 0,
    courses: courses.count ?? 0,
    batches: batches.count ?? 0,
    sections: sections.count ?? 0,
    activeStudents: activeStudents.count ?? 0,
    recentImports: imports,
  };
}
/* ---------------- drill-down breakdown ---------------- */

export type BreakdownSection = { id: string; label: string; count: number };
export type BreakdownBatch = {
  id: string;
  label: string;
  years: string;
  count: number;
  sections: BreakdownSection[];
};
export type BreakdownCourse = {
  id: string;
  label: string;
  name: string;
  count: number;
  batches: BreakdownBatch[];
};
export type StudentBreakdown = {
  total: number;
  active: number;
  inactive: number;
  courses: BreakdownCourse[];
};

/** Course -> batch -> section student counts, used by the dashboard drill-down. */
export async function getStudentBreakdown(): Promise<StudentBreakdown> {
  const [courses, batches, sections, studentsResult] = await Promise.all([
    listCourses(),
    listBatches(),
    listSections(),
    supabase
      .from("students")
      .select("id, course_id, batch_id, section_id, status")
      .range(0, 19999),
  ]);
  if (studentsResult.error) throw new Error(studentsResult.error.message);
  const students = (studentsResult.data ?? []) as Array<{
    course_id: string;
    batch_id: string;
    section_id: string | null;
    status: string;
  }>;

  const byCourse = new Map<string, number>();
  const byBatch = new Map<string, number>();
  const bySection = new Map<string, number>();
  let active = 0;
  for (const student of students) {
    byCourse.set(student.course_id, (byCourse.get(student.course_id) ?? 0) + 1);
    byBatch.set(student.batch_id, (byBatch.get(student.batch_id) ?? 0) + 1);
    if (student.section_id)
      bySection.set(student.section_id, (bySection.get(student.section_id) ?? 0) + 1);
    if (student.status === "active") active += 1;
  }

  const courseRows: BreakdownCourse[] = courses
    .map((course) => ({
      id: course.id,
      label: course.code,
      name: course.name,
      count: byCourse.get(course.id) ?? 0,
      batches: batches
        .filter((batch) => batch.course_id === course.id)
        .map((batch) => ({
          id: batch.id,
          label: batch.name,
          years: `${batch.start_year}–${batch.end_year}`,
          count: byBatch.get(batch.id) ?? 0,
          sections: sections
            .filter((section) => section.batch_id === batch.id)
            .map((section) => ({
              id: section.id,
              label: section.name,
              count: bySection.get(section.id) ?? 0,
            })),
        })),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total: students.length,
    active,
    inactive: students.length - active,
    courses: courseRows,
  };
}
