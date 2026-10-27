import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, GraduationCap, Layers, Search, X, Mail } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GridBackdrop } from "@/components/effects/GridBackdrop";
import { listBatches, listCourses, listStudents, type Student } from "@/lib/db";
import { getStudentSubjects } from "@/lib/subjects";

export const Route = createFileRoute("/_authenticated/students/cards")({
  head: () => ({
    meta: [
      { title: "Student cards | XYZ University Exam Branch" },
      {
        name: "description",
        content:
          "Browse every student as a detail card and open a profile to see the subjects that student is registered for.",
      },
      { property: "og:title", content: "Student cards | XYZ University Exam Branch" },
      {
        property: "og:description",
        content: "Student detail cards with per-student subject registration.",
      },
    ],
  }),
  component: StudentCardsWindow,
});

const PAGE_SIZE = 60;

function StudentCardsWindow() {
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("all");
  const [batchId, setBatchId] = useState("all");
  const [profile, setProfile] = useState<Student | null>(null);

  const courses = useQuery({ queryKey: ["courses"], queryFn: listCourses });
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => listBatches() });

  const query = useMemo(
    () => ({
      search: search.trim() || undefined,
      courseId: courseId === "all" ? undefined : courseId,
      batchId: batchId === "all" ? undefined : batchId,
      page: 1,
      pageSize: PAGE_SIZE,
    }),
    [search, courseId, batchId],
  );

  const students = useQuery({
    queryKey: ["student-cards", query],
    queryFn: () => listStudents(query),
  });

  const subjects = useQuery({
    queryKey: ["student-subjects", profile?.id],
    queryFn: () => getStudentSubjects(profile!.id),
    enabled: Boolean(profile),
  });

  const filteredBatches = (batches.data ?? []).filter(
    (batch) => courseId === "all" || batch.course_id === courseId,
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-6 py-7">
      <GridBackdrop soft />
      <div className="relative mx-auto w-full max-w-6xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          XYZ University · Examination branch
        </p>
        <h1 className="shine-text mt-1 text-2xl font-semibold tracking-tight">Student cards</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {students.data?.total?.toLocaleString() ?? "…"} students on the register · click a card to
          open the profile and its subjects.
        </p>
        <span className="gold-rule mt-3 block h-px" />

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reg. no, roll no or name"
              className="pl-9"
            />
          </div>
          <Select
            value={courseId}
            onValueChange={(value) => {
              setCourseId(value);
              setBatchId("all");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {(courses.data ?? []).map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.code} — {course.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={batchId} onValueChange={setBatchId}>
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
        </div>

        {students.isLoading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full" />
            ))}
          </div>
        ) : (students.data?.rows.length ?? 0) === 0 ? (
          <p className="panel mt-4 p-6 text-sm text-muted-foreground">
            No students match these filters.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(students.data?.rows ?? []).map((student, index) => (
              <button
                key={student.id}
                type="button"
                onClick={() => setProfile(student)}
                style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
                className="glow-card rise-in panel w-full p-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                    {student.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{student.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {student.registration_number}
                      {student.roll_number ? ` · Roll ${student.roll_number}` : ""}
                    </p>
                    {student.email ? (
                      <p className="truncate text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Mail className="size-3 shrink-0" />
                        <span className="truncate">{student.email}</span>
                      </p>
                    ) : null}
                  </div>
                  <Badge
                    variant={student.status === "active" ? "default" : "secondary"}
                    className="ml-auto shrink-0"
                  >
                    {student.status}
                  </Badge>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Course</dt>
                    <dd className="mt-0.5 font-medium">{student.courses?.code ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Batch</dt>
                    <dd className="mt-0.5 font-medium">{student.batches?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Section</dt>
                    <dd className="mt-0.5 font-medium">{student.sections?.name ?? "—"}</dd>
                  </div>
                </dl>
                <span className="gold-rule mt-3 block h-px" />
              </button>
            ))}
          </div>
        )}

        {(students.data?.total ?? 0) > PAGE_SIZE ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing the first {PAGE_SIZE} matches — narrow the search to see others.
          </p>
        ) : null}
      </div>

      {profile ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-6 backdrop-blur-sm">
          <div className="panel rise-in relative w-full max-w-lg p-5">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3"
              onClick={() => setProfile(null)}
            >
              <X className="size-4" />
            </Button>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Student profile
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{profile.name}</h2>
            <p className="text-sm text-muted-foreground">
              {profile.registration_number}
              {profile.roll_number ? ` · Roll ${profile.roll_number}` : ""}
            </p>
            <span className="gold-rule mt-3 block h-px" />

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Detail icon={BookOpen} label="Course" value={profile.courses?.code ?? "—"} />
              <Detail icon={Layers} label="Batch" value={profile.batches?.name ?? "—"} />
              <Detail
                icon={GraduationCap}
                label="Section"
                value={profile.sections?.name ?? "Unassigned"}
              />
              <Detail icon={Mail} label="Email" value={profile.email ?? "—"} />
            </div>

            <h3 className="mt-5 text-sm font-semibold">Subjects registered</h3>
            {subjects.isLoading ? (
              <Skeleton className="mt-2 h-16 w-full" />
            ) : (subjects.data?.length ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No subjects mapped yet — upload a workbook with subject columns to merge them.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {(subjects.data ?? []).map((subject) => (
                  <li
                    key={subject.id}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="truncate">{subject.name}</span>
                    {subject.code ? (
                      <span className="text-xs text-muted-foreground">{subject.code}</span>
                    ) : null}
                    {subject.semester ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Sem {subject.semester}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}
