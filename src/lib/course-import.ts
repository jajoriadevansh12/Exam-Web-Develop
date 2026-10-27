import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "./db";
import { normalizeRegistrationNumber, normalizeSectionName } from "./student-import";

export type MasterRow = {
  rowNumber: number;
  courseName: string;
  courseCode: string;
  batchName: string;
  startYear: number | null;
  endYear: number | null;
  section: string;
  registrationNumber: string;
  rollNumber: string;
  name: string;
  email: string;
  subjects: string[];
};

export type MasterPreview = {
  fileName: string;
  totalRows: number;
  rows: MasterRow[];
  skipped: Array<{ rowNumber: number; reason: string }>;
  courses: string[];
  batches: string[];
  sections: string[];
  subjects: string[];
  students: number;
};

export type MasterApplyResult = {
  courses: number;
  batches: number;
  sections: number;
  students: number;
  subjects: number;
  links: number;
};

const SINGLE: Record<string, keyof MasterRow> = {
  course: "courseName",
  "course name": "courseName",
  programme: "courseName",
  program: "courseName",
  "course code": "courseCode",
  coursecode: "courseCode",
  code: "courseCode",
  batch: "batchName",
  "batch name": "batchName",
  year: "batchName",
  "academic year": "batchName",
  class: "section",
  "class name": "section",
  section: "section",
  "section name": "section",
  "registration number": "registrationNumber",
  "registration no": "registrationNumber",
  "reg no": "registrationNumber",
  "reg number": "registrationNumber",
  regno: "registrationNumber",
  registrationnumber: "registrationNumber",
  "roll number": "rollNumber",
  "roll no": "rollNumber",
  rollno: "rollNumber",
  rollnumber: "rollNumber",
  name: "name",
  "student name": "name",
  studentname: "name",
  email: "email",
  "student email": "email",
  "email id": "email",
  emailid: "email",
  "email address": "email",
  mail: "email",
};

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[._-]/g, " ").replace(/\s+/g, " ").trim();
}

function matchMasterField(rawHeader: string): keyof MasterRow | undefined {
  const norm = normalizeHeader(rawHeader);
  if (SINGLE[norm]) return SINGLE[norm];

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

  if (
    norm.includes("name") &&
    !norm.includes("course") &&
    !norm.includes("batch") &&
    !norm.includes("section") &&
    !norm.includes("subject")
  ) {
    return "name";
  }

  if (norm.includes("section") || norm === "sec" || norm.includes("class")) {
    return "section";
  }

  return undefined;
}

function isSubjectHeader(header: string) {
  return /^subjects?(\s*\d+)?$/.test(header) || /^(paper|subject code)/.test(header);
}

function splitSubjects(value: string) {
  return value
    .split(/[,;/|]+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 1);
}

function parseYears(batchName: string) {
  const match = batchName.match(/(20\d{2})\s*[-–to]{1,3}\s*(20\d{2})/i);
  if (match) return { start: Number(match[1]), end: Number(match[2]) };
  const single = batchName.match(/(20\d{2})/);
  if (single) return { start: Number(single[1]), end: Number(single[1]) + 4 };
  return { start: null, end: null };
}

export async function parseMasterWorkbook(file: File): Promise<MasterPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "" });

  const rows: MasterRow[] = [];
  const skipped: MasterPreview["skipped"] = [];

  raw.forEach((record, index) => {
    const rowNumber = index + 2;
    const mapped: Record<string, string> = {};
    const subjects: string[] = [];
    let fallbackEmail = "";

    for (const [header, value] of Object.entries(record)) {
      const key = normalizeHeader(header);
      const text = String(value ?? "").trim();
      if (!text) continue;
      if (isSubjectHeader(key)) {
        subjects.push(...splitSubjects(text));
        continue;
      }
      const field = matchMasterField(header);
      if (field) {
        mapped[field] = text;
      } else if (!fallbackEmail && text.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        fallbackEmail = text.toLowerCase();
      }
    }

    const email = (mapped["email"] || fallbackEmail || "").trim().toLowerCase();

    const name = (mapped["name"] ?? "").replace(/\s+/g, " ").trim();
    const registrationNumber = normalizeRegistrationNumber(
      mapped["registrationNumber"] ?? mapped["rollNumber"] ?? "",
    );
    if (!name || !registrationNumber) {
      skipped.push({ rowNumber, reason: !name ? "Missing student name" : "Missing registration/roll number" });
      return;
    }

    const courseName = mapped["courseName"] ?? "";
    const courseCode = (mapped["courseCode"] ?? courseName.replace(/[^a-z]/gi, "").slice(0, 8))
      .trim()
      .toUpperCase();
    const batchName = mapped["batchName"] ?? "";
    const years = parseYears(batchName);

    rows.push({
      rowNumber,
      courseName: courseName || courseCode,
      courseCode,
      batchName,
      startYear: years.start,
      endYear: years.end,
      section: normalizeSectionName(mapped["section"] ?? ""),
      registrationNumber,
      rollNumber: mapped["rollNumber"] ?? "",
      name,
      email: (mapped["email"] ?? "").trim().toLowerCase(),
      subjects: [...new Set(subjects)],
    });
  });

  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();

  return {
    fileName: file.name,
    totalRows: raw.length,
    rows,
    skipped,
    courses: unique(rows.map((row) => row.courseCode)),
    batches: unique(rows.map((row) => row.batchName)),
    sections: unique(rows.map((row) => row.section)),
    subjects: unique(rows.flatMap((row) => row.subjects)),
    students: rows.length,
  };
}

/** Creates missing courses, batches, sections, students and subjects, then merges
 *  each subject onto the students it belongs to. */
export async function applyMasterWorkbook(preview: MasterPreview): Promise<MasterApplyResult> {
  const result: MasterApplyResult = {
    courses: 0,
    batches: 0,
    sections: 0,
    students: 0,
    subjects: 0,
    links: 0,
  };
  if (preview.rows.length === 0) throw new Error("Nothing to import from this workbook.");

  /* courses */
  const { data: courseRows, error: courseError } = await supabase.from("courses").select("id, code");
  if (courseError) throw new Error(courseError.message);
  const courseMap = new Map((courseRows ?? []).map((row) => [row.code.toUpperCase(), row.id]));

  for (const row of preview.rows) {
    if (!row.courseCode || courseMap.has(row.courseCode)) continue;
    const { data, error } = await supabase
      .from("courses")
      .insert({ code: row.courseCode, name: row.courseName || row.courseCode })
      .select("id, code")
      .single();
    if (error) throw new Error(error.message);
    courseMap.set(data.code.toUpperCase(), data.id);
    result.courses += 1;
    await logActivity({
      entity_type: "course",
      entity_id: data.id,
      entity_label: data.code,
      action: "auto-created by workbook import",
    });
  }

  /* batches */
  const { data: batchRows, error: batchError } = await supabase
    .from("batches")
    .select("id, name, course_id");
  if (batchError) throw new Error(batchError.message);
  const batchKey = (courseId: string, name: string) => `${courseId}::${name.toLowerCase()}`;
  const batchMap = new Map(
    (batchRows ?? []).map((row) => [batchKey(row.course_id, row.name), row.id]),
  );

  for (const row of preview.rows) {
    const courseId = courseMap.get(row.courseCode);
    if (!courseId) continue;
    const name = row.batchName || "General";
    if (batchMap.has(batchKey(courseId, name))) continue;
    const { data, error } = await supabase
      .from("batches")
      .insert({
        course_id: courseId,
        name,
        start_year: row.startYear ?? new Date().getFullYear(),
        end_year: row.endYear ?? new Date().getFullYear() + 4,
      })
      .select("id, name, course_id")
      .single();
    if (error) throw new Error(error.message);
    batchMap.set(batchKey(data.course_id, data.name), data.id);
    result.batches += 1;
  }

  /* sections */
  const { data: sectionRows, error: sectionError } = await supabase
    .from("sections")
    .select("id, name, batch_id");
  if (sectionError) throw new Error(sectionError.message);
  const sectionKey = (batchId: string, name: string) => `${batchId}::${name.toLowerCase()}`;
  const sectionMap = new Map(
    (sectionRows ?? []).map((row) => [sectionKey(row.batch_id, row.name), row.id]),
  );

  for (const row of preview.rows) {
    const courseId = courseMap.get(row.courseCode);
    if (!courseId || !row.section) continue;
    const batchId = batchMap.get(batchKey(courseId, row.batchName || "General"));
    if (!batchId) continue;
    if (sectionMap.has(sectionKey(batchId, row.section))) continue;
    const { data, error } = await supabase
      .from("sections")
      .insert({ batch_id: batchId, name: row.section })
      .select("id, name, batch_id")
      .single();
    if (error) throw new Error(error.message);
    sectionMap.set(sectionKey(data.batch_id, data.name), data.id);
    result.sections += 1;
  }

  /* students */
  const payload = preview.rows
    .map((row) => {
      const courseId = courseMap.get(row.courseCode);
      if (!courseId) return null;
      const batchId = batchMap.get(batchKey(courseId, row.batchName || "General"));
      if (!batchId) return null;
      return {
        registration_number: row.registrationNumber,
        roll_number: row.rollNumber || null,
        name: row.name,
        email: row.email || null,
        course_id: courseId,
        batch_id: batchId,
        section_id: row.section ? (sectionMap.get(sectionKey(batchId, row.section)) ?? null) : null,
        status: "active",
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  for (let index = 0; index < payload.length; index += 200) {
    const chunk = payload.slice(index, index + 200);
    const { error } = await supabase
      .from("students")
      .upsert(chunk, { onConflict: "registration_number" });
    if (error) throw new Error(error.message);
    result.students += chunk.length;
  }

  const { data: studentRows, error: studentError } = await supabase
    .from("students")
    .select("id, registration_number")
    .in(
      "registration_number",
      preview.rows.map((row) => row.registrationNumber),
    );
  if (studentError) throw new Error(studentError.message);
  const studentMap = new Map((studentRows ?? []).map((row) => [row.registration_number, row.id]));

  /* subjects + merge onto students */
  const { data: subjectRows, error: subjectError } = await supabase
    .from("subjects")
    .select("id, name, course_id, batch_id");
  if (subjectError) throw new Error(subjectError.message);
  const subjectKey = (courseId: string, batchId: string, name: string) =>
    `${courseId}::${batchId}::${name.toLowerCase()}`;
  const subjectMap = new Map(
    (subjectRows ?? []).map((row) => [
      subjectKey(row.course_id ?? "", row.batch_id ?? "", row.name),
      row.id,
    ]),
  );

  const links: Array<{ student_id: string; subject_id: string }> = [];

  for (const row of preview.rows) {
    const courseId = courseMap.get(row.courseCode);
    if (!courseId) continue;
    const batchId = batchMap.get(batchKey(courseId, row.batchName || "General"));
    if (!batchId) continue;
    const studentId = studentMap.get(row.registrationNumber);
    if (!studentId) continue;

    for (const subjectName of row.subjects) {
      let subjectId = subjectMap.get(subjectKey(courseId, batchId, subjectName));
      if (!subjectId) {
        const { data, error } = await supabase
          .from("subjects")
          .insert({ name: subjectName, course_id: courseId, batch_id: batchId })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        subjectId = data.id;
        subjectMap.set(subjectKey(courseId, batchId, subjectName), subjectId);
        result.subjects += 1;
      }
      links.push({ student_id: studentId, subject_id: subjectId });
    }
  }

  for (let index = 0; index < links.length; index += 300) {
    const chunk = links.slice(index, index + 300);
    const { error } = await supabase
      .from("student_subjects")
      .upsert(chunk, { onConflict: "student_id,subject_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    result.links += chunk.length;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  await supabase.from("import_logs").insert({
    import_type: "master_workbook",
    file_name: preview.fileName,
    total_rows: preview.totalRows,
    created_count: result.students,
    updated_count: result.subjects,
    skipped_count: preview.skipped.length,
    performed_by: sessionData.session?.user.id ?? null,
  });

  return result;
}
