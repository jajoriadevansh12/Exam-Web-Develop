import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

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
import { GridBackdrop } from "@/components/effects/GridBackdrop";
import { SuggestInput } from "@/components/shared/SuggestInput";
import {
  createBatch,
  createCourse,
  createSection,
  listBatches,
  listCourses,
} from "@/lib/db";
import { createRoom } from "@/lib/seating";
import { applyMasterWorkbook, parseMasterWorkbook, type MasterPreview } from "@/lib/course-import";
import { notifyOpenerAndClose } from "@/lib/popup";

export const Route = createFileRoute("/_authenticated/quick/$entity")({
  head: () => ({
    meta: [
      { title: "Quick add | XYZ University Exam Branch" },
      {
        name: "description",
        content:
          "Detached window for adding courses, batches, sections and halls, or uploading a master workbook.",
      },
      { property: "og:title", content: "Quick add | XYZ University Exam Branch" },
      {
        property: "og:description",
        content: "Add master data without leaving the record you were working on.",
      },
    ],
  }),
  component: QuickAddWindow,
});

const TITLES: Record<string, string> = {
  course: "New course",
  batch: "New batch",
  section: "New section",
  room: "New exam hall",
  workbook: "Upload master workbook",
};

function QuickAddWindow() {
  const { entity } = useParams({ from: "/_authenticated/quick/$entity" });
  const title = TITLES[entity] ?? "Quick add";

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-6 py-8">
      <GridBackdrop soft />
      <div className="relative mx-auto w-full max-w-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          XYZ University · Examination branch
        </p>
        <h1 className="shine-text mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <span className="gold-rule mt-3 block h-px" />

        <div className="panel rise-in mt-5 p-5">
          {entity === "course" ? <CourseForm /> : null}
          {entity === "batch" ? <BatchForm /> : null}
          {entity === "section" ? <SectionForm /> : null}
          {entity === "room" ? <RoomForm /> : null}
          {entity === "workbook" ? <WorkbookForm /> : null}
          {!TITLES[entity] ? (
            <p className="text-sm text-muted-foreground">Nothing to add here.</p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Footer({ pending, onSave }: { pending: boolean; onSave: () => void }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="outline" onClick={() => window.close()}>
        Cancel
      </Button>
      <Button onClick={onSave} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null} Save
      </Button>
    </div>
  );
}

function CourseForm() {
  const [form, setForm] = useState({ name: "", code: "" });
  const save = useMutation({
    mutationFn: () =>
      createCourse({ name: form.name.trim(), code: form.code.trim().toUpperCase() }),
    onSuccess: () => {
      toast.success("Course created");
      notifyOpenerAndClose();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create course"),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="q-course-name">Course name</Label>
        <Input
          id="q-course-name"
          value={form.name}
          maxLength={120}
          placeholder="Bachelor of Technology"
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="q-course-code">Course code</Label>
        <Input
          id="q-course-code"
          value={form.code}
          maxLength={20}
          placeholder="BT"
          onChange={(event) => setForm({ ...form, code: event.target.value })}
        />
      </div>
      <Footer
        pending={save.isPending}
        onSave={() => {
          if (form.name.trim().length < 2 || form.code.trim().length < 2) {
            toast.error("Course name and code are required.");
            return;
          }
          save.mutate();
        }}
      />
    </div>
  );
}

function BatchForm() {
  const courses = useQuery({ queryKey: ["courses"], queryFn: listCourses });
  const [form, setForm] = useState({
    course_id: "",
    name: "",
    start_year: new Date().getFullYear(),
    end_year: new Date().getFullYear() + 4,
  });

  const save = useMutation({
    mutationFn: () =>
      createBatch({
        course_id: form.course_id,
        name: form.name.trim(),
        start_year: form.start_year,
        end_year: form.end_year,
      }),
    onSuccess: () => {
      toast.success("Batch created");
      notifyOpenerAndClose();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create batch"),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Course</Label>
        <Select value={form.course_id} onValueChange={(value) => setForm({ ...form, course_id: value })}>
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
        <Label htmlFor="q-batch-name">Batch name</Label>
        <Input
          id="q-batch-name"
          value={form.name}
          placeholder="2024-2028"
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="q-batch-start">Start year</Label>
          <Input
            id="q-batch-start"
            type="number"
            value={form.start_year}
            onChange={(event) => setForm({ ...form, start_year: Number(event.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-batch-end">End year</Label>
          <Input
            id="q-batch-end"
            type="number"
            value={form.end_year}
            onChange={(event) => setForm({ ...form, end_year: Number(event.target.value) })}
          />
        </div>
      </div>
      <Footer
        pending={save.isPending}
        onSave={() => {
          if (!form.course_id || form.name.trim().length < 2) {
            toast.error("Pick a course and give the batch a name.");
            return;
          }
          save.mutate();
        }}
      />
    </div>
  );
}

function SectionForm() {
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => listBatches() });
  const [form, setForm] = useState({ batch_id: "", name: "" });

  const save = useMutation({
    mutationFn: () => createSection({ batch_id: form.batch_id, name: form.name.trim() }),
    onSuccess: () => {
      toast.success("Section created");
      notifyOpenerAndClose();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create section"),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Batch</Label>
        <Select value={form.batch_id} onValueChange={(value) => setForm({ ...form, batch_id: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select batch" />
          </SelectTrigger>
          <SelectContent>
            {(batches.data ?? []).map((batch) => (
              <SelectItem key={batch.id} value={batch.id}>
                {batch.courses?.code ?? ""} · {batch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="q-section-name">Section</Label>
        <Input
          id="q-section-name"
          value={form.name}
          placeholder="A"
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </div>
      <Footer
        pending={save.isPending}
        onSave={() => {
          if (!form.batch_id || !form.name.trim()) {
            toast.error("Pick a batch and name the section.");
            return;
          }
          save.mutate();
        }}
      />
    </div>
  );
}

function RoomForm() {
  const [form, setForm] = useState({
    block: "Main",
    room_number: "",
    row_count: 6,
    seats_per_row: 6,
  });
  const save = useMutation({
    mutationFn: () =>
      createRoom({
        block: form.block.trim() || "Main",
        room_number: form.room_number.trim(),
        row_count: form.row_count,
        seats_per_row: form.seats_per_row,
        is_active: true,
      }),
    onSuccess: () => {
      toast.success("Hall added");
      notifyOpenerAndClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add hall"),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="q-room-block">Block</Label>
          <SuggestInput
            id="q-room-block"
            value={form.block}
            onChange={(value) => setForm({ ...form, block: value })}
            suggestions={[
              { value: "Main" },
              { value: "Annexe" },
              { value: "Science" },
              { value: "Commerce" },
            ]}
            placeholder="Main"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-room-number">Room number</Label>
          <Input
            id="q-room-number"
            value={form.room_number}
            onChange={(event) => setForm({ ...form, room_number: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-room-rows">Rows</Label>
          <Input
            id="q-room-rows"
            type="number"
            min={1}
            value={form.row_count}
            onChange={(event) => setForm({ ...form, row_count: Number(event.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-room-seats">Seats per row</Label>
          <Input
            id="q-room-seats"
            type="number"
            min={1}
            value={form.seats_per_row}
            onChange={(event) => setForm({ ...form, seats_per_row: Number(event.target.value) })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Capacity: {form.row_count * form.seats_per_row} seats
      </p>
      <Footer
        pending={save.isPending}
        onSave={() => {
          if (!form.room_number.trim()) {
            toast.error("Room number is required.");
            return;
          }
          save.mutate();
        }}
      />
    </div>
  );
}

function WorkbookForm() {
  const [preview, setPreview] = useState<MasterPreview | null>(null);
  const [approvedDiffs, setApprovedDiffs] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const apply = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("Choose a workbook first");
      return applyMasterWorkbook(preview, approvedDiffs);
    },
    onSuccess: (result) => {
      toast.success(
        `${result.students} students · ${result.courses} courses · ${result.subjects} subjects merged`,
      );
      notifyOpenerAndClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Import failed"),
  });

  const stats = useMemo(
    () =>
      preview
        ? [
            { label: "Students", value: preview.students },
            { label: "Courses", value: preview.courses.length },
            { label: "Batches", value: preview.batches.length },
            { label: "Sections", value: preview.sections.length },
            { label: "Changes detected", value: preview.diffs?.length ?? 0 },
            { label: "Skipped rows", value: preview.skipped.length },
          ]
        : [],
    [preview],
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload one workbook containing course, class/year, student and subject columns. If any course or student already exists in the database, the system will show you the exact changes and let you choose whether to update or keep the existing previous data.
      </p>

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center transition-colors hover:bg-muted/40">
        <FileSpreadsheet className="size-6 text-primary" />
        <span className="text-sm font-medium">
          {preview ? preview.fileName : "Choose .xlsx / .xls / .csv"}
        </span>
        <span className="text-xs text-muted-foreground">
          Headers: Course, Course Code, Batch/Year, Class/Section, Registration No, Roll No, Name,
          Subject 1…n
        </span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;

            const ext = file.name.split(".").pop()?.toLowerCase();
            if (!ext || !["xlsx", "xls", "csv"].includes(ext)) {
              toast.error(
                `File rejected: ".${ext}" is not supported. Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed. PDF and image files are strictly rejected.`,
              );
              event.target.value = "";
              return;
            }

            setBusy(true);
            try {
              const res = await parseMasterWorkbook(file);
              setPreview(res);
              setApprovedDiffs(new Set((res.diffs ?? []).map((d) => d.id)));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not read the workbook");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>

      {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}

      {preview ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-md border border-border p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Diff Conflict Resolver Section */}
          {preview.diffs && preview.diffs.length > 0 ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                <div>
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                    Changes Detected in Existing Records ({preview.diffs.length})
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Tick to apply the new Excel change, or untick to keep the previous database value.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] px-2.5"
                    onClick={() => setApprovedDiffs(new Set(preview.diffs.map((d) => d.id)))}
                  >
                    Select All New
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] px-2.5"
                    onClick={() => setApprovedDiffs(new Set())}
                  >
                    Keep All Previous
                  </Button>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto divide-y divide-border/60 rounded-lg border border-border/60 bg-card">
                {preview.diffs.map((d) => {
                  const isChecked = approvedDiffs.has(d.id);
                  return (
                    <div
                      key={d.id}
                      className="p-2.5 flex items-start gap-3 hover:bg-muted/40 transition-colors"
                    >
                      <Checkbox
                        id={d.id}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          setApprovedDiffs((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(d.id);
                            else next.delete(d.id);
                            return next;
                          });
                        }}
                        className="mt-1"
                      />
                      <label htmlFor={d.id} className="flex-1 cursor-pointer space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-xs text-foreground">
                            {d.identifier}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              isChecked
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                                : "bg-muted text-muted-foreground border border-border"
                            }`}
                          >
                            {isChecked ? "✓ Apply New Change" : "Keep Previous"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-muted-foreground text-[11px]">
                            {d.field}:
                          </span>
                          <span className="line-through text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded text-[11px]">
                            Previous: {d.oldValue}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-[11px]">
                            New: {d.newValue}
                          </span>
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>No existing record clashes. All records are either new or completely up to date.</span>
            </div>
          )}

          {preview.subjects.length ? (
            <div className="flex flex-wrap gap-1.5">
              {preview.subjects.slice(0, 24).map((subject) => (
                <span
                  key={subject}
                  className="rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground"
                >
                  {subject}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button variant="outline" onClick={() => window.close()}>
          Cancel
        </Button>
        <Button onClick={() => apply.mutate()} disabled={!preview || apply.isPending}>
          {apply.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          Import and merge
        </Button>
      </div>

      {apply.isSuccess ? (
        <p className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="size-4" /> Imported successfully
        </p>
      ) : null}
    </div>
  );
}
