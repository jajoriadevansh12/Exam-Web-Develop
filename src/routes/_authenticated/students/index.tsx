import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPagination } from "@/components/shared/DataPagination";
import {
  deleteStudent,
  listBatches,
  listCourses,
  listSections,
  listStudents,
  updateStudent,
  type Student,
} from "@/lib/db";

export const Route = createFileRoute("/_authenticated/students/")({
  head: () => ({
    meta: [
      { title: "Students | XYZ University Exam Branch" },
      {
        name: "description",
        content:
          "Search, filter and edit student records by registration number, roll number, course, batch and section.",
      },
      { property: "og:title", content: "Students | XYZ University Exam Branch" },
      {
        property: "og:description",
        content: "Student register with registration number as permanent identity.",
      },
    ],
  }),
  component: StudentsPage,
});

const PAGE_SIZE = 20;
const STATUSES = ["active", "detained", "passout", "dropped"];

const schema = z.object({
  registration_number: z.string().trim().min(1, "Registration number is required").max(60),
  name: z.string().trim().min(2, "Name is required").max(160),
  roll_number: z.string().trim().max(60),
  email: z
    .string()
    .trim()
    .max(255)
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: "Invalid email address",
    }),
  course_id: z.string().min(1, "Course is required"),
  batch_id: z.string().min(1, "Batch is required"),
  section_id: z.string(),
  status: z.enum(["active", "detained", "passout", "dropped"]),
});

function StudentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("all");
  const [batchId, setBatchId] = useState("all");
  const [sectionId, setSectionId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState({
    registration_number: "",
    name: "",
    roll_number: "",
    email: "",
    course_id: "",
    batch_id: "",
    section_id: "none",
    status: "active",
  });

  const courses = useQuery({ queryKey: ["courses"], queryFn: listCourses });
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => listBatches() });
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => listSections() });

  const query = useMemo(
    () => ({
      search: search.trim() || undefined,
      courseId: courseId === "all" ? undefined : courseId,
      batchId: batchId === "all" ? undefined : batchId,
      sectionId: sectionId === "all" ? undefined : sectionId,
      status: status === "all" ? undefined : status,
      page,
      pageSize: PAGE_SIZE,
    }),
    [search, courseId, batchId, sectionId, status, page],
  );

  const students = useQuery({
    queryKey: ["students", query],
    queryFn: () => listStudents(query),
  });

  const editingBatches = useMemo(
    () => (batches.data ?? []).filter((batch) => batch.course_id === form.course_id),
    [batches.data, form.course_id],
  );

  const editingSections = useMemo(
    () => (sections.data ?? []).filter((section) => section.batch_id === form.batch_id),
    [sections.data, form.batch_id],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("No student selected");
      const parsed = schema.parse(form);
      return updateStudent(
        editing.id,
        {
          registration_number: parsed.registration_number,
          name: parsed.name,
          email: parsed.email || null,
          roll_number: parsed.roll_number || null,
          course_id: parsed.course_id,
          batch_id: parsed.batch_id,
          section_id: parsed.section_id === "none" ? null : parsed.section_id,
          status: parsed.status,
        },
        editing,
      );
    },
    onSuccess: () => {
      toast.success("Student updated");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["students"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Invalid input")
          : error instanceof Error
            ? error.message
            : "Update failed",
      ),
  });

  const remove = useMutation({
    mutationFn: (student: Student) => deleteStudent(student.id, student.registration_number),
    onSuccess: () => {
      toast.success("Student deleted");
      void queryClient.invalidateQueries({ queryKey: ["students"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  function openEdit(student: Student) {
    setEditing(student);
    setForm({
      registration_number: student.registration_number,
      name: student.name,
      roll_number: student.roll_number ?? "",
      email: student.email ?? "",
      course_id: student.course_id,
      batch_id: student.batch_id,
      section_id: student.section_id ?? "none",
      status: student.status,
    });
  }

  const filteredBatches = (batches.data ?? []).filter(
    (batch) => courseId === "all" || batch.course_id === courseId,
  );
  const filteredSections = (sections.data ?? []).filter(
    (section) => batchId === "all" || section.batch_id === batchId,
  );

  return (
    <AdminLayout
      title="Students"
      description="Registration number is the permanent identity"
      actions={
        <Button asChild>
          <Link to="/students/import">
            <Upload className="size-4" /> Excel import
          </Link>
        </Button>
      }
    >
      <div className="panel">
        <div className="grid gap-2 border-b border-border p-4 md:grid-cols-2 xl:grid-cols-5">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search reg. no, roll no or name"
          />
          <Select
            value={courseId}
            onValueChange={(value) => {
              setCourseId(value);
              setBatchId("all");
              setSectionId("all");
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {(courses.data ?? []).map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={batchId}
            onValueChange={(value) => {
              setBatchId(value);
              setSectionId("all");
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {filteredBatches.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sectionId}
            onValueChange={(value) => {
              setSectionId(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {filteredSections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {students.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (students.data?.rows.length ?? 0) === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No students match these filters. Import a master workbook to populate the register.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Registration no.</th>
                  <th className="px-4 py-2.5 font-medium">Roll no.</th>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Course</th>
                  <th className="px-4 py-2.5 font-medium">Batch</th>
                  <th className="px-4 py-2.5 font-medium">Section</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(students.data?.rows ?? []).map((student) => (
                  <tr key={student.id}>
                    <td className="px-4 py-2.5 font-medium">{student.registration_number}</td>
                    <td className="px-4 py-2.5">{student.roll_number ?? "—"}</td>
                    <td className="px-4 py-2.5">{student.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{student.email || "—"}</td>
                    <td className="px-4 py-2.5">{student.courses?.code ?? "—"}</td>
                    <td className="px-4 py-2.5">{student.batches?.name ?? "—"}</td>
                    <td className="px-4 py-2.5">{student.sections?.name ?? "Unassigned"}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={student.status === "active" ? "default" : "secondary"}>
                        {student.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(student)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove.mutate(student)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DataPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={students.data?.total ?? 0}
          onPageChange={setPage}
        />
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(next) => (next ? null : setEditing(null))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Student: {editing?.registration_number}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="student-reg">Registration number</Label>
                <Input
                  id="student-reg"
                  value={form.registration_number}
                  maxLength={60}
                  onChange={(event) =>
                    setForm({ ...form, registration_number: event.target.value.toUpperCase() })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="student-roll">Roll number</Label>
                <Input
                  id="student-roll"
                  value={form.roll_number}
                  maxLength={60}
                  onChange={(event) => setForm({ ...form, roll_number: event.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="student-name">Student name</Label>
              <Input
                id="student-name"
                value={form.name}
                maxLength={160}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="student-email">Email address</Label>
              <Input
                id="student-email"
                type="email"
                placeholder="student@university.edu"
                value={form.email}
                maxLength={255}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Course</Label>
                <Select
                  value={form.course_id}
                  onValueChange={(val) => {
                    const nextBatches = (batches.data ?? []).filter((b) => b.course_id === val);
                    setForm({
                      ...form,
                      course_id: val,
                      batch_id: nextBatches[0]?.id ?? "",
                      section_id: "none",
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    {(courses.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Batch</Label>
                <Select
                  value={form.batch_id}
                  onValueChange={(val) => setForm({ ...form, batch_id: val, section_id: "none" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    {editingBatches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Section</Label>
                <Select
                  value={form.section_id}
                  onValueChange={(value) => setForm({ ...form, section_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {editingSections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm({ ...form, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}