import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getStudentBreakdown } from "@/lib/db";

export type DrillLevel = "courses" | "batches" | "sections";

function Row({
  title,
  subtitle,
  count,
  total,
  onClick,
}: {
  title: string;
  subtitle?: string;
  count: number;
  total: number;
  onClick?: () => void;
}) {
  const share = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className="w-full rounded-lg border border-border px-3 py-2.5 text-left transition-colors enabled:hover:bg-muted/50 disabled:cursor-default"
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium">{title}</span>
        {subtitle ? (
          <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
        <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">
          {count.toLocaleString()}
        </span>
        {onClick ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" /> : null}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
      </div>
    </button>
  );
}

export function StudentDrillDown({
  open,
  onOpenChange,
  startLevel = "courses",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startLevel?: DrillLevel;
}) {
  const [courseId, setCourseId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["student-breakdown"],
    queryFn: getStudentBreakdown,
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setCourseId(null);
      setBatchId(null);
    }
  }, [open]);

  const course = data?.courses.find((item) => item.id === courseId) ?? null;
  const batch = course?.batches.find((item) => item.id === batchId) ?? null;

  const flatBatches = (data?.courses ?? []).flatMap((item) =>
    item.batches.map((entry) => ({ ...entry, course: item.label })),
  );
  const flatSections = flatBatches.flatMap((entry) =>
    entry.sections.map((section) => ({ ...section, parent: `${entry.course} · ${entry.label}` })),
  );

  const total = data?.total ?? 0;

  const crumbs = [
    startLevel === "courses" ? "All courses" : startLevel === "batches" ? "All batches" : "All sections",
    course ? `${course.label}` : null,
    batch ? batch.label : null,
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" />
            {crumbs.join(" › ")}
          </DialogTitle>
        </DialogHeader>

        {batch || course ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => (batch ? setBatchId(null) : setCourseId(null))}
          >
            <ChevronLeft className="size-4" /> Back
          </Button>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="space-y-2">
            {batch ? (
              batch.sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sections recorded for this batch yet.
                </p>
              ) : (
                batch.sections.map((section) => (
                  <Row
                    key={section.id}
                    title={section.label}
                    count={section.count}
                    total={batch.count || 1}
                  />
                ))
              )
            ) : course ? (
              course.batches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No batches for this course yet.</p>
              ) : (
                course.batches.map((entry) => (
                  <Row
                    key={entry.id}
                    title={entry.label}
                    subtitle={entry.years}
                    count={entry.count}
                    total={course.count || 1}
                    onClick={() => setBatchId(entry.id)}
                  />
                ))
              )
            ) : startLevel === "sections" ? (
              flatSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sections yet.</p>
              ) : (
                flatSections.map((section) => (
                  <Row
                    key={section.id}
                    title={section.label}
                    subtitle={section.parent}
                    count={section.count}
                    total={total || 1}
                  />
                ))
              )
            ) : startLevel === "batches" ? (
              flatBatches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No batches yet.</p>
              ) : (
                flatBatches.map((entry) => (
                  <Row
                    key={entry.id}
                    title={entry.label}
                    subtitle={entry.course}
                    count={entry.count}
                    total={total || 1}
                  />
                ))
              )
            ) : data?.courses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No courses yet — create one to see the breakdown.
              </p>
            ) : (
              data?.courses.map((item) => (
                <Row
                  key={item.id}
                  title={item.label}
                  subtitle={item.name}
                  count={item.count}
                  total={total || 1}
                  onClick={() => setCourseId(item.id)}
                />
              ))
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button asChild size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            <Link to="/students">Open student register</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            <Link to="/courses">Manage courses</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
