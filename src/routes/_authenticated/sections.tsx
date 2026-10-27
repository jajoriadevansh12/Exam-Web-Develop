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
import {
  createSection,
  deleteSection,
  listBatches,
  listSections,
  updateSection,
  type Section,
} from "@/lib/db";
import { normalizeSectionName } from "@/lib/student-import";

export const Route = createFileRoute("/_authenticated/sections")({
  head: () => ({
    meta: [
      { title: "Sections | XYZ University Exam Branch" },
      {
        name: "description",
        content:
          "Manage sections inside each batch. Sections are also created automatically during Excel import.",
      },
      { property: "og:title", content: "Sections | XYZ University Exam Branch" },
      { property: "og:description", content: "Section master data per batch." },
    ],
  }),
  component: SectionsPage,
});

const schema = z.object({
  batch_id: z.string().uuid("Select a batch"),
  name: z.string().trim().min(1, "Section name is required").max(60),
});

const PAGE_SIZE = 10;

function SectionsPage() {
  const queryClient = useQueryClient();
  const [batchFilter, setBatchFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [form, setForm] = useState({ batch_id: "", name: "" });

  const batches = useQuery({ queryKey: ["batches"], queryFn: () => listBatches() });
  const sections = useQuery({ queryKey: ["sections"], queryFn: () => listSections() });

  const filtered = useMemo(() => {
    const rows = sections.data ?? [];
    return batchFilter === "all" ? rows : rows.filter((row) => row.batch_id === batchFilter);
  }, [sections.data, batchFilter]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = schema.parse({
        batch_id: form.batch_id,
        name: normalizeSectionName(form.name),
      });
      return editing ? updateSection(editing.id, parsed) : createSection(parsed);
    },
    onSuccess: () => {
      toast.success(editing ? "Section updated" : "Section created");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["sections"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Invalid input")
          : error instanceof Error
            ? error.message
            : "Could not save section",
      ),
  });

  const remove = useMutation({
    mutationFn: deleteSection,
    onSuccess: () => {
      toast.success("Section deleted");
      void queryClient.invalidateQueries({ queryKey: ["sections"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: () => toast.error("Cannot delete this section while students are assigned to it."),
  });

  function openCreate() {
    setEditing(null);
    setForm({ batch_id: batchFilter === "all" ? "" : batchFilter, name: "" });
    setOpen(true);
  }

  function openEdit(section: Section) {
    setEditing(section);
    setForm({ batch_id: section.batch_id, name: section.name });
    setOpen(true);
  }

  return (
    <AdminLayout title="Sections" description="Section structure within each batch">
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

      <div className="panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <Select
            value={batchFilter}
            onValueChange={(value) => {
              setBatchFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="All batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {(batches.data ?? []).map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.courses?.code ? `${batch.courses.code} · ` : ""}
                  {batch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="ml-auto" onClick={openCreate}>
            <Plus className="size-4" /> New section
          </Button>
        </div>

        {sections.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : paged.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No sections yet. They are created automatically when you import a workbook that has a
            section column.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Section</th>
                  <th className="px-4 py-2.5 font-medium">Batch</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paged.map((section) => (
                  <tr key={section.id}>
                    <td className="px-4 py-2.5 font-medium">{section.name}</td>
                    <td className="px-4 py-2.5">
                      {section.batches?.courses?.code ? `${section.batches.courses.code} · ` : ""}
                      {section.batches?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(section)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove.mutate(section.id)}
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
            <DialogTitle>{editing ? "Edit section" : "New section"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Batch</Label>
              <Select
                value={form.batch_id}
                onValueChange={(value) => setForm({ ...form, batch_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  {(batches.data ?? []).map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.courses?.code ? `${batch.courses.code} · ` : ""}
                      {batch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="section-name">Section name</Label>
              <Input
                id="section-name"
                value={form.name}
                maxLength={60}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="A"
              />
              <p className="text-xs text-muted-foreground">
                A single letter is normalised to “Section A”.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}