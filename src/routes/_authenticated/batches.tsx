import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LayoutGrid, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
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
import { HierarchyExplorer } from "@/components/explore/HierarchyExplorer";
import {
  createBatch,
  deleteBatch,
  listBatches,
  listCourses,
  updateBatch,
  type Batch,
} from "@/lib/db";

export const Route = createFileRoute("/_authenticated/batches")({
  head: () => ({
    meta: [
      { title: "Batches | XYZ University Exam Branch" },
      {
        name: "description",
        content: "Define admission batches such as 2024-2028 and attach them to a course.",
      },
      { property: "og:title", content: "Batches | XYZ University Exam Branch" },
      { property: "og:description", content: "Batch master data for the examination branch." },
    ],
  }),
  component: BatchesPage,
});

const schema = z.object({
  course_id: z.string().uuid("Select a course"),
  name: z.string().trim().min(2, "Batch name is required").max(60),
  start_year: z.number().int().min(1950).max(2100),
  end_year: z.number().int().min(1950).max(2100),
});

const PAGE_SIZE = 10;
const EMPTY_FORM = { course_id: "", name: "", start_year: "", end_year: "" };

function BatchesPage() {
  const queryClient = useQueryClient();
  const [courseFilter, setCourseFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

  const courses = useQuery({ queryKey: ["courses"], queryFn: listCourses });
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => listBatches() });

  const filtered = useMemo(() => {
    const rows = batches.data ?? [];
    return courseFilter === "all" ? rows : rows.filter((row) => row.course_id === courseFilter);
  }, [batches.data, courseFilter]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse({
        course_id: form.course_id,
        name: form.name,
        start_year: Number(form.start_year),
        end_year: Number(form.end_year),
      });
      if (parsed.end_year <= parsed.start_year) {
        throw new Error("End year must be later than start year");
      }
      return editing ? updateBatch(editing.id, parsed) : createBatch(parsed);
    },
    onSuccess: () => {
      toast.success(editing ? "Batch updated" : "Batch created");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Invalid input")
          : error instanceof Error
            ? error.message
            : "Could not save batch",
      ),
  });

  const remove = useMutation({
    mutationFn: deleteBatch,
    onSuccess: () => {
      toast.success("Batch deleted");
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: () =>
      toast.error("Cannot delete this batch while sections or students reference it."),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(batch: Batch) {
    setEditing(batch);
    setForm({
      course_id: batch.course_id,
      name: batch.name,
      start_year: String(batch.start_year),
      end_year: String(batch.end_year),
    });
    setOpen(true);
  }

  return (
    <AdminLayout title="Batches" description="Admission year groups per course">
      {/* Banner to Unified Academic Hub */}
      <div className="mb-4 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <LayoutGrid className="size-4" />
          </span>
          <div>
            <p className="text-xs sm:text-sm font-semibold text-foreground">
              💡 Manage Courses, Batches & Sections All-in-One!
            </p>
            <p className="text-[11px] text-muted-foreground">
              You can now view, add, and organize your entire academic hierarchy in one interactive tree.
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="h-8 text-xs font-semibold gap-1.5 shrink-0 rounded-lg">
          <Link to="/courses">
            Open Unified Academic Tree →
          </Link>
        </Button>
      </div>

      <section className="mb-5">
        <h2 className="text-sm font-semibold tracking-tight">
          Explore — course › year › section › students
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Tap a card to drill down. Student cards open the profile with their registered subjects.
        </p>
        <div className="mt-3">
          <HierarchyExplorer />
        </div>
      </section>

      <div className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <Select
            value={courseFilter}
            onValueChange={(value) => {
              setCourseFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-56">
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
          <Button className="ml-auto" onClick={openCreate}>
            <Plus className="size-4" /> New batch
          </Button>
        </div>

        {batches.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : paged.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No batches yet. Create a batch such as 2024-2028 for a course.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Batch</th>
                  <th className="px-4 py-2.5 font-medium">Course</th>
                  <th className="px-4 py-2.5 font-medium">Years</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paged.map((batch) => (
                  <tr key={batch.id}>
                    <td className="px-4 py-2.5 font-medium">{batch.name}</td>
                    <td className="px-4 py-2.5">
                      {batch.courses ? `${batch.courses.code} — ${batch.courses.name}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {batch.start_year} – {batch.end_year}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(batch)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove.mutate(batch.id)}
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
          total={filtered.length}
          onPageChange={setPage}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit batch" : "New batch"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Course</Label>
              <Select
                value={form.course_id}
                onValueChange={(value) => setForm({ ...form, course_id: value })}
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
              <Label htmlFor="batch-name">Batch name</Label>
              <Input
                id="batch-name"
                value={form.name}
                maxLength={60}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="2024-2028"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start-year">Start year</Label>
                <Input
                  id="start-year"
                  type="number"
                  value={form.start_year}
                  onChange={(event) => setForm({ ...form, start_year: event.target.value })}
                  placeholder="2024"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-year">End year</Label>
                <Input
                  id="end-year"
                  type="number"
                  value={form.end_year}
                  onChange={(event) => setForm({ ...form, end_year: event.target.value })}
                  placeholder="2028"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}