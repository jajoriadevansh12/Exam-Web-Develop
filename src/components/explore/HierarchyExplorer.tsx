import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, ChevronLeft, GraduationCap, Layers, Users } from "lucide-react";

import { GridBackdrop } from "@/components/effects/GridBackdrop";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getStudentBreakdown, listStudents, type Student } from "@/lib/db";
import { getStudentSubjects } from "@/lib/subjects";

type Crumb = { id: string; label: string };

function ExploreCard({
  icon: Icon,
  title,
  subtitle,
  metric,
  metricLabel,
  onClick,
  delay,
}: {
  icon: typeof Users;
  title: string;
  subtitle?: string;
  metric?: string | number;
  metricLabel?: string;
  onClick?: () => void;
  delay: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{ animationDelay: `${delay * 40}ms` }}
      className="glow-card rise-in panel group relative w-full overflow-hidden p-4 text-left transition-shadow enabled:cursor-pointer enabled:hover:shadow-lg disabled:cursor-default"
    >
      <GridBackdrop soft />
      <div className="relative flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {metric !== undefined ? (
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold tabular-nums">{metric}</p>
            {metricLabel ? (
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {metricLabel}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <span className="gold-rule absolute inset-x-0 bottom-0 h-px opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

/** Course -> year (batch) -> section -> students with their subjects, all as cards. */
export function HierarchyExplorer() {
  const [course, setCourse] = useState<Crumb | null>(null);
  const [batch, setBatch] = useState<Crumb | null>(null);
  const [section, setSection] = useState<Crumb | null>(null);
  const [profile, setProfile] = useState<Student | null>(null);

  const breakdown = useQuery({ queryKey: ["student-breakdown"], queryFn: getStudentBreakdown });

  const students = useQuery({
    queryKey: ["explorer-students", batch?.id, section?.id],
    queryFn: () =>
      listStudents({
        batchId: batch?.id,
        sectionId: section?.id === "none" ? undefined : section?.id,
        page: 1,
        pageSize: 200,
      }),
    enabled: Boolean(section),
  });

  const subjects = useQuery({
    queryKey: ["student-subjects", profile?.id],
    queryFn: () => getStudentSubjects(profile?.id ?? ""),
    enabled: Boolean(profile),
  });

  const courseRow = breakdown.data?.courses.find((item) => item.id === course?.id) ?? null;
  const batchRow = courseRow?.batches.find((item) => item.id === batch?.id) ?? null;

  const crumbs = ["Courses", course?.label, batch?.label, section?.label].filter(Boolean);

  function back() {
    if (section) setSection(null);
    else if (batch) setBatch(null);
    else setCourse(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {course ? (
          <Button size="sm" variant="outline" onClick={back}>
            <ChevronLeft className="size-4" /> Back
          </Button>
        ) : null}
        <p className="text-sm text-muted-foreground">{crumbs.join(" \u203A ")}</p>
      </div>

      {breakdown.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-20 w-full" />
          ))}
        </div>
      ) : section ? (
        students.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (students.data?.rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No students in this section yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(students.data?.rows ?? []).map((student, index) => (
              <ExploreCard
                key={student.id}
                icon={Users}
                title={student.name}
                subtitle={`${student.registration_number} \u00B7 Roll ${student.roll_number ?? "—"}`}
                metric={student.status === "active" ? "Active" : "Inactive"}
                onClick={() => setProfile(student)}
                delay={index}
              />
            ))}
          </div>
        )
      ) : batchRow ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {batchRow.sections.length === 0 ? (
            <ExploreCard
              icon={GraduationCap}
              title="No sections"
              subtitle="All students sit directly under this year"
              metric={batchRow.count}
              metricLabel="students"
              onClick={() => setSection({ id: "none", label: "All students" })}
              delay={0}
            />
          ) : (
            batchRow.sections.map((item, index) => (
              <ExploreCard
                key={item.id}
                icon={GraduationCap}
                title={`Section ${item.label}`}
                subtitle={`${course?.label} \u00B7 ${batch?.label}`}
                metric={item.count}
                metricLabel="students"
                onClick={() => setSection({ id: item.id, label: `Section ${item.label}` })}
                delay={index}
              />
            ))
          )}
        </div>
      ) : courseRow ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courseRow.batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No years/batches for this course yet.</p>
          ) : (
            courseRow.batches.map((item, index) => (
              <ExploreCard
                key={item.id}
                icon={Layers}
                title={item.label}
                subtitle={item.years}
                metric={item.count}
                metricLabel="students"
                onClick={() => setBatch({ id: item.id, label: item.label })}
                delay={index}
              />
            ))
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(breakdown.data?.courses ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses yet — create one first.</p>
          ) : (
            (breakdown.data?.courses ?? []).map((item, index) => (
              <ExploreCard
                key={item.id}
                icon={BookOpen}
                title={item.label}
                subtitle={item.name}
                metric={item.count}
                metricLabel="students"
                onClick={() => setCourse({ id: item.id, label: item.label })}
                delay={index}
              />
            ))
          )}
        </div>
      )}

      <Dialog open={Boolean(profile)} onOpenChange={(open) => (open ? undefined : setProfile(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{profile?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              {profile?.registration_number} · Roll {profile?.roll_number ?? "—"}
            </p>
            <p className="text-muted-foreground">
              {profile?.courses?.code} · {profile?.batches?.name} ·{" "}
              {profile?.sections?.name ? `Section ${profile.sections.name}` : "No section"}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Subjects registered</p>
            {subjects.isLoading ? (
              <Skeleton className="mt-2 h-8 w-full" />
            ) : (subjects.data ?? []).length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                No subjects merged for this student yet.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(subjects.data ?? []).map((subject) => (
                  <Badge key={subject.id} variant="secondary">
                    {subject.code ? `${subject.code} · ` : ""}
                    {subject.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
