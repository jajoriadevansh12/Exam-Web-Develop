import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listBatches, listCourses } from "@/lib/db";
import { applySyncPreview, buildSyncPreview, type SyncPreview } from "@/lib/student-import";

export const Route = createFileRoute("/_authenticated/students/import")({
  head: () => ({
    meta: [
      { title: "Excel Import | XYZ University Exam Branch" },
      {
        name: "description",
        content:
          "Upload a master student workbook, review new and changed records, then apply the synchronisation.",
      },
      { property: "og:title", content: "Excel Import | XYZ University Exam Branch" },
      {
        property: "og:description",
        content: "Smart student synchronisation with a review step before any data is written.",
      },
    ],
  }),
  component: ImportPage,
});

function ImportPage() {
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());

  const courses = useQuery({ queryKey: ["courses"], queryFn: listCourses });
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => listBatches() });

  const batchOptions = (batches.data ?? []).filter(
    (batch) => !courseId || batch.course_id === courseId,
  );

  const actionable = useMemo(
    () => (preview?.entries ?? []).filter((entry) => entry.kind !== "unchanged"),
    [preview],
  );
  const counts = useMemo(() => {
    const entries = preview?.entries ?? [];
    return {
      created: entries.filter((entry) => entry.kind === "new").length,
      changed: entries.filter((entry) => entry.kind === "changed").length,
      unchanged: entries.filter((entry) => entry.kind === "unchanged").length,
    };
  }, [preview]);

  const analyse = useMutation({
    mutationFn: async () => {
      if (!courseId) throw new Error("Select a course first");
      if (!batchId) throw new Error("Select a batch first");
      if (!file) throw new Error("Choose an Excel workbook");
      return buildSyncPreview({ file, batchId });
    },
    onSuccess: (result) => {
      setPreview(result);
      setApproved(
        new Set(result.entries.filter((entry) => entry.kind !== "unchanged").map((e) => e.key)),
      );
      toast.success("Workbook analysed. Review the changes before applying.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not read the workbook"),
  });

  const apply = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Analyse a workbook first");
      return applySyncPreview({ preview, courseId, batchId, approvedKeys: approved });
    },
    onSuccess: (result) => {
      toast.success(
        `Import applied: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`,
      );
      setPreview(null);
      setFile(null);
      setApproved(new Set());
      void queryClient.invalidateQueries({ queryKey: ["students"] });
      void queryClient.invalidateQueries({ queryKey: ["sections"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Import failed"),
  });

  function toggle(key: string) {
    setApproved((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <AdminLayout
      title="Excel Import"
      description="Smart student synchronisation with a mandatory review step"
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-1">
          <h2 className="text-sm font-semibold">1. Choose target</h2>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Course</Label>
              <Select
                value={courseId}
                onValueChange={(value) => {
                  setCourseId(value);
                  setBatchId("");
                  setPreview(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  {(courses.data ?? []).map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.code} — {course.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Batch</Label>
              <Select
                value={batchId}
                onValueChange={(value) => {
                  setBatchId(value);
                  setPreview(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  {batchOptions.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workbook">Master workbook (.xlsx / .csv)</Label>
              <Input
                id="workbook"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  if (selected) {
                    const ext = selected.name.split(".").pop()?.toLowerCase();
                    if (!ext || !["xlsx", "xls", "csv"].includes(ext)) {
                      toast.error(
                        `File rejected: ".${ext}" is not supported. Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed. PDF and image files are strictly rejected.`,
                      );
                      event.target.value = "";
                      setFile(null);
                      setPreview(null);
                      return;
                    }
                  }
                  setFile(selected);
                  setPreview(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Expected columns: Registration Number, Roll Number, Student Name, Section. Header
                spellings are matched flexibly.
              </p>
            </div>

            <Button
              className="w-full"
              onClick={() => analyse.mutate()}
              disabled={analyse.isPending}
            >
              {analyse.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Analyse workbook
            </Button>
          </div>
        </div>

        <div className="panel lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            <h2 className="text-sm font-semibold">2. Review synchronisation</h2>
            {preview ? (
              <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
                <Badge>{counts.created} new</Badge>
                <Badge variant="secondary">{counts.changed} changed</Badge>
                <Badge variant="outline">{counts.unchanged} unchanged</Badge>
              </div>
            ) : null}
          </div>

          {!preview ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <FileSpreadsheet className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nothing analysed yet. Pick a course, a batch and a workbook, then run the analysis.
              </p>
            </div>
          ) : (
            <div>
              <div className="space-y-2 p-4 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">{preview.fileName}</span> ·{" "}
                  {preview.totalRows} rows read
                </p>
                {preview.newSections.length ? (
                  <p className="flex items-start gap-2 text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 text-primary" />
                    New sections that will be created: {preview.newSections.join(", ")}
                  </p>
                ) : null}
                {preview.duplicateRows.length > 0 && (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 space-y-2">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                      <span>{preview.duplicateRows.length} Duplicate Records Rejected (Skipped)</span>
                    </p>
                    <div className="max-h-28 overflow-y-auto divide-y divide-amber-500/10 text-xs rounded-lg border border-amber-500/15 bg-card/60">
                      {preview.duplicateRows.map((dup, idx) => (
                        <div key={idx} className="px-3 py-1.5 flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                            Row {dup.rowNumber}
                          </span>
                          <span className="text-muted-foreground text-[11px]">
                            Registration No: <strong className="text-foreground">{dup.registrationNumber}</strong> (Duplicate in file)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {preview.invalidRows.length > 0 && (
                  <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3.5 space-y-2">
                    <p className="text-xs font-bold text-rose-800 dark:text-rose-400 flex items-center gap-2">
                      <AlertTriangle className="size-4 text-rose-600 shrink-0" />
                      <span>{preview.invalidRows.length} Invalid Rows Rejected (Missing Required Fields)</span>
                    </p>
                    <div className="max-h-32 overflow-y-auto divide-y divide-rose-500/10 text-xs rounded-lg border border-rose-500/15 bg-card/60">
                      {preview.invalidRows.map((inv, idx) => (
                        <div key={idx} className="px-3 py-1.5 flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-rose-700 dark:text-rose-300">
                            Row {inv.rowNumber}
                          </span>
                          <span className="font-medium text-rose-600 dark:text-rose-400 text-[11px]">
                            {inv.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {actionable.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  Everything in this workbook already matches the database. Nothing to apply.
                </p>
              ) : (
                <div className="max-h-[26rem] overflow-auto border-t border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Apply</th>
                        <th className="px-4 py-2.5 font-medium">Registration no.</th>
                        <th className="px-4 py-2.5 font-medium">Name</th>
                        <th className="px-4 py-2.5 font-medium">Email</th>
                        <th className="px-4 py-2.5 font-medium">Type</th>
                        <th className="px-4 py-2.5 font-medium">Changes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {actionable.map((entry) => (
                        <tr key={entry.key}>
                          <td className="px-4 py-2.5">
                            <Checkbox
                              checked={approved.has(entry.key)}
                              onCheckedChange={() => toggle(entry.key)}
                            />
                          </td>
                          <td className="px-4 py-2.5 font-medium">{entry.registrationNumber}</td>
                          <td className="px-4 py-2.5">{entry.name}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{entry.email || "—"}</td>
                          <td className="px-4 py-2.5">
                            {entry.kind === "new" ? (
                              <Badge variant="default" className="bg-primary/90 text-primary-foreground font-semibold">
                                New Student
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className={
                                  approved.has(entry.key)
                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold"
                                    : "border-border bg-muted text-muted-foreground"
                                }
                              >
                                {approved.has(entry.key) ? "✓ Will Update" : "Keeping Previous"}
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {entry.kind === "new" ? (
                              <span>
                                {entry.section || "Unassigned"}
                                {entry.rollNumber ? ` · roll ${entry.rollNumber}` : ""}
                              </span>
                            ) : (
                              <div className="space-y-1">
                                {entry.changes.map((change, i) => (
                                  <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
                                    <span className="font-semibold text-[10px] uppercase text-muted-foreground">
                                      {change.field}:
                                    </span>
                                    <span className="line-through text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded text-[11px] border border-rose-200 dark:border-rose-900/40">
                                      Pehle: {change.from || "Empty"}
                                    </span>
                                    <span className="text-muted-foreground">→</span>
                                    <span className="font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded text-[11px] border border-emerald-200 dark:border-emerald-900/40">
                                      Ab: {change.to}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
                <p className="text-sm text-muted-foreground">
                  {approved.size} of {actionable.length} changes selected
                </p>
                <div className="ml-auto flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setApproved(new Set(actionable.map((entry) => entry.key)))}
                    disabled={actionable.length === 0}
                  >
                    Select all
                  </Button>
                  <Button
                    onClick={() => apply.mutate()}
                    disabled={apply.isPending || approved.size === 0}
                  >
                    {apply.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Apply synchronisation
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}