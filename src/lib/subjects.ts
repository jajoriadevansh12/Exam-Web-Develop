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
