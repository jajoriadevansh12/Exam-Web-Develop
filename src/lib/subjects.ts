import { supabase } from "@/integrations/supabase/client";

export type Subject = {
  id: string;
  code: string | null;
  name: string;
  course_id: string | null;
  batch_id: string | null;
  semester: number | null;
  courses?: { code: string; name: string } | null;
  batches?: { name: string } | null;
};

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export async function listSubjects(filters?: { courseId?: string; batchId?: string }) {
  let query = supabase
    .from("subjects")
    .select("*, courses(code, name), batches(name)")
    .order("name");
  if (filters?.courseId) query = query.eq("course_id", filters.courseId);
  if (filters?.batchId) query = query.eq("batch_id", filters.batchId);
  return unwrap<Subject[]>(await query);
}

/** Subjects a single student is enrolled in. */
export async function getStudentSubjects(studentId: string) {
  const rows = unwrap<Array<{ subjects: Subject | null }>>(
    await supabase
      .from("student_subjects")
      .select("subjects(*, courses(code, name), batches(name))")
      .eq("student_id", studentId),
  );
  return rows
    .map((row) => row.subjects)
    .filter((subject): subject is Subject => Boolean(subject))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Enrolment counts per subject, for the subject cards. */
export async function countSubjectStudents(subjectIds: string[]) {
  if (subjectIds.length === 0) return {} as Record<string, number>;
  const rows = unwrap<Array<{ subject_id: string }>>(
    await supabase.from("student_subjects").select("subject_id").in("subject_id", subjectIds),
  );
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.subject_id] = (acc[row.subject_id] ?? 0) + 1;
    return acc;
  }, {});
}

/** Detailed subject student counts including student_subjects mapping and course/batch counts */
export async function getDetailedSubjectStudentCounts(): Promise<{
  bySubjectId: Record<string, number>;
  byCourseAndBatch: Record<string, number>;
}> {
  // 1. Exact mapping from student_subjects
  const { data: mappingData } = await supabase
    .from("student_subjects")
    .select("subject_id")
    .range(0, 49999);

  const bySubjectId: Record<string, number> = {};
  for (const row of mappingData || []) {
    if (row.subject_id) {
      bySubjectId[row.subject_id] = (bySubjectId[row.subject_id] || 0) + 1;
    }
  }

  // 2. Active students grouped by course_id and batch_id (e.g. Mechanical vs E-Com)
  const { data: studentData } = await supabase
    .from("students")
    .select("course_id, batch_id")
    .eq("status", "active")
    .range(0, 49999);

  const byCourseAndBatch: Record<string, number> = {};
  for (const s of studentData || []) {
    if (s.course_id && s.batch_id) {
      const key = `${s.course_id}_${s.batch_id}`;
      byCourseAndBatch[key] = (byCourseAndBatch[key] || 0) + 1;
    }
  }

  return { bySubjectId, byCourseAndBatch };
}
