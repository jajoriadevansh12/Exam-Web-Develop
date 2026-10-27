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
  // Registration Number / Enrollment / Admission
  "registration number": "registrationNumber",
  "registration no": "registrationNumber",
  "registration": "registrationNumber",
  "reg number": "registrationNumber",
  "reg no": "registrationNumber",
  regno: "registrationNumber",
  "reg_no": "registrationNumber",
  "reg-no": "registrationNumber",
  registrationnumber: "registrationNumber",
  "enrollment number": "registrationNumber",
  "enrollment no": "registrationNumber",
  "enrollment": "registrationNumber",
  "enroll no": "registrationNumber",
  "enrolment number": "registrationNumber",
  "enrolment no": "registrationNumber",
  "enrolment": "registrationNumber",
  "enrol no": "registrationNumber",
  enrollmentno: "registrationNumber",
  enrolmentno: "registrationNumber",
  "admission number": "registrationNumber",
  "admission no": "registrationNumber",
  "admission id": "registrationNumber",
  admission: "registrationNumber",
  "scholar number": "registrationNumber",
  "scholar no": "registrationNumber",
  "scholar id": "registrationNumber",
  scholar: "registrationNumber",
  "student id": "registrationNumber",
  "student id number": "registrationNumber",
  studentid: "registrationNumber",
  "student_id": "registrationNumber",
  "id number": "registrationNumber",
  "univ reg no": "registrationNumber",
  "university reg no": "registrationNumber",
  "university registration number": "registrationNumber",
  "reg id": "registrationNumber",

  // Roll Number
  "roll number": "rollNumber",
  "roll no": "rollNumber",
  rollno: "rollNumber",
  rollnumber: "rollNumber",
  roll: "rollNumber",
  "roll_no": "rollNumber",
  "roll-no": "rollNumber",
  "class roll no": "rollNumber",
  "class roll number": "rollNumber",
  "class roll": "rollNumber",
  "univ roll no": "rollNumber",
  "university roll no": "rollNumber",
  "university roll number": "rollNumber",
  "exam roll no": "rollNumber",
  "exam roll number": "rollNumber",
  "student roll no": "rollNumber",
  "student roll number": "rollNumber",
  "r no": "rollNumber",
  rno: "rollNumber",
  "r_no": "rollNumber",

  // Name
  "student name": "name",
  name: "name",
  studentname: "name",
  "candidate name": "name",
  "full name": "name",
  fullname: "name",
  "student full name": "name",
  "student fullname": "name",
  "student s name": "name",
  "students name": "name",
  "candidate s name": "name",
  "candidates name": "name",
  "name of student": "name",
  "name of the student": "name",
  "name of candidate": "name",
  student: "name",
  candidate: "name",
  "applicant name": "name",
  "pupil name": "name",
  "learner name": "name",

  // Email
  email: "email",
  "student email": "email",
  "student s email": "email",
  "student email id": "email",
  "email id": "email",
  emailid: "email",
  "email address": "email",
  emailaddress: "email",
  "e mail": "email",
  "e mail id": "email",
  "e mail address": "email",
  mail: "email",
  "mail id": "email",
  mailid: "email",
  "official email": "email",
  "official email id": "email",
  "college email": "email",
  "institute email": "email",
  "university email": "email",
  "contact email": "email",
  "personal email": "email",
  webmail: "email",
  gmail: "email",

  // Section
  section: "section",
  "section name": "section",
  "section no": "section",
  sec: "section",
  "sec name": "section",
  "class section": "section",
  division: "section",
  div: "section",
  "class division": "section",
  classroom: "section",
  group: "section",
};

function normalizeHeader(header: string) {
  return String(header ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchStudentField(rawHeader: string): keyof Omit<ExcelStudentRow, "rowNumber"> | undefined {
  const norm = normalizeHeader(rawHeader);
  if (HEADER_ALIASES[norm]) return HEADER_ALIASES[norm];

  // Ignore serial numbers so they never conflict with roll or registration
  if (
    norm === "s no" ||
    norm === "sr no" ||
    norm === "sl no" ||
    norm === "no" ||
    norm === "s n" ||
    norm === "serial no" ||
    norm === "index"
  ) {
    return undefined;
  }

  // Email detection
  if (
    norm.includes("email") ||
    norm.includes("e mail") ||
    norm.includes("mail id") ||
    norm.includes("mailid") ||
    norm === "mail" ||
    norm.endsWith("mail") ||
    norm.includes("gmail") ||
    norm.includes("webmail")
  ) {
    return "email";
  }

  // Registration / Enrollment / Admission
  if (
    norm.includes("registration") ||
    norm.includes("enroll") ||
    norm.includes("enrol") ||
    norm.startsWith("reg") ||
    norm.includes("reg no") ||
    norm.includes("admission") ||
    norm.includes("scholar") ||
    norm.includes("student id") ||
    norm === "id"
  ) {
    return "registrationNumber";
  }

  // Roll Number
  if (
    norm.includes("roll") ||
    norm === "r no" ||
    norm === "rno"
  ) {
    return "rollNumber";
  }

  // Section / Class / Division
  if (
    norm.includes("section") ||
    norm === "sec" ||
    norm.startsWith("sec ") ||
    norm.endsWith(" sec") ||
    norm.includes("division") ||
    norm === "div" ||
    (norm.includes("class") && !norm.includes("roll") && !norm.includes("name"))
  ) {
    return "section";
  }

  // Student Name (strictly exclude other non-student entities)
  const EXCLUDED_WORDS = [
    "course",
    "batch",
    "section",
    "subject",
    "paper",
    "father",
    "mother",
    "parent",
    "guardian",
    "college",
    "school",
    "institute",
    "university",
    "department",
    "dept",
    "teacher",
    "faculty",
    "professor",
    "file",
    "room",
    "hall",
    "exam",
  ];
  const hasExcludedWord = EXCLUDED_WORDS.some((word) => norm.includes(word));

  if (!hasExcludedWord) {
    if (
      norm.includes("name") ||
      norm === "student" ||
      norm === "candidate" ||
      norm.includes("candidate") ||
      norm.includes("student")
    ) {
      return "name";
    }
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
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !["xlsx", "xls", "csv"].includes(ext)) {
    throw new Error(
      `File rejected: Unsupported format (.${ext || "unknown"}). Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed. PDF, PNG, images and documents are strictly rejected.`,
    );
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "" });

  return raw.map((record, index) => {
    const mapped: Record<string, string> = {};
    let fallbackEmail: string | undefined = undefined;

    // Scan headers in ANY order; don't overwrite specific match with a generic one
    for (const [header, value] of Object.entries(record)) {
      const text = String(value ?? "").trim();
      if (!text) continue;

      const field = matchStudentField(header);
      if (field) {
        if (!mapped[field]) {
          mapped[field] = text;
        }
      } else if (!fallbackEmail && text.includes("@") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        fallbackEmail = text.toLowerCase();
      }
    }

    const emailVal = (mapped["email"] || fallbackEmail || "").trim().toLowerCase();
    const rawReg = (mapped["registrationNumber"] || mapped["rollNumber"] || "").trim();
    const rawRoll = (mapped["rollNumber"] || mapped["registrationNumber"] || "").trim();

    return {
      registrationNumber: normalizeRegistrationNumber(rawReg),
      rollNumber: rawRoll,
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