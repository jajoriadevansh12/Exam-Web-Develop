import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Armchair,
  Calendar,
  CheckCircle2,
  Clock,
  Folder,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { listBatches, listCourses } from "@/lib/db";
import {
  deleteExam,
  getBatchStudentCounts,
  listExamsDetailed,
  saveExamWithBatches,
  type ExamDetailed,
} from "@/lib/seating";

export const Route = createFileRoute("/_authenticated/exams/")({
  head: () => ({
    meta: [
      { title: "Examinations | University Exam Branch" },
      {
        name: "description",
        content:
          "Manage examination categories, papers, enrolled batches, student counts, and schedule conflict detection.",
      },
      { property: "og:title", content: "Examinations | University Exam Branch" },
    ],
  }),
  component: ExamsPage,
});

const DEFAULT_CATEGORIES = ["Mid Semester", "End Semester", "Supplementary"];

const schema = z.object({
  category: z.string().trim().min(1, "Folder / Category is required"),
  subjectName: z.string().trim().min(2, "Subject / Paper name is required").max(160),
  exam_date: z.string().min(1, "Exam date is required"),
  session: z.enum(["morning", "afternoon", "evening"]),
  batchSelections: z
    .array(
      z.object({
        course_id: z.string(),
        batch_id: z.string(),
      }),
    )
    .min(1, "Please select at least one batch sitting for this exam"),
});

type FormState = {
  id?: string;
  category: string;
  customCategory: string;
  subjectName: string;
  exam_date: string;
  session: "morning" | "afternoon" | "evening";
  batchSelections: Array<{ course_id: string; batch_id: string }>;
};

const EMPTY_FORM: FormState = {
  category: "Mid Semester",
  customCategory: "",
  subjectName: "",
  exam_date: "",
  session: "morning",
  batchSelections: [],
};

function ExamsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamDetailed | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [courseFilterInDialog, setCourseFilterInDialog] = useState<string>("all");

  const { data: exams = [], isLoading: examsLoading } = useQuery({
    queryKey: ["exams_detailed"],
    queryFn: listExamsDetailed,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: listCourses,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: () => listBatches(),
  });

  const { data: batchCounts = {} } = useQuery({
    queryKey: ["batch_student_counts"],
    queryFn: getBatchStudentCounts,
  });

  // Collect distinct categories from both defaults and existing exams
  const allCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    for (const e of exams) {
      if (e.category && e.category !== "General") {
        set.add(e.category);
      }
    }
    return Array.from(set);
  }, [exams]);

  // Filter exams by folder and search term
  const filteredExams = useMemo(() => {
    let list = exams;
    if (selectedFolder !== "all") {
      list = list.filter((e) => e.category === selectedFolder);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.subjectName.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q) ||
          e.exam_date.includes(q) ||
          e.groups.some(
            (g) =>
              g.batches?.name.toLowerCase().includes(q) ||
              g.courses?.name.toLowerCase().includes(q) ||
              g.courses?.code.toLowerCase().includes(q),
          ),
      );
    }
    return list;
  }, [exams, selectedFolder, searchQuery]);

  // Real-time Clash Check for the current form state
  const formClashes = useMemo(() => {
    if (!form.exam_date || !form.session || form.batchSelections.length === 0) return [];
    const selectedBatchIds = new Set(form.batchSelections.map((b) => b.batch_id));
    const clashes: Array<{ batchName: string; otherExamName: string; examDate: string; session: string }> = [];

    for (const other of exams) {
      if (other.id === form.id) continue;
      if (other.exam_date === form.exam_date && other.session.toLowerCase() === form.session.toLowerCase()) {
        for (const g of other.groups) {
          if (selectedBatchIds.has(g.batch_id)) {
            const bName = `${g.courses?.code || ""} ${g.batches?.name || ""}`.trim() || g.batches?.name || "Batch";
            clashes.push({
              batchName: bName,
              otherExamName: other.subjectName || other.name,
              examDate: other.exam_date,
              session: other.session,
            });
          }
        }
      }
    }
    return clashes;
  }, [form.exam_date, form.session, form.batchSelections, form.id, exams]);

  // Total enrolled students for selected batches in dialog
  const totalFormStudents = useMemo(() => {
    return form.batchSelections.reduce((sum, b) => sum + (batchCounts[b.batch_id] || 0), 0);
  }, [form.batchSelections, batchCounts]);

  // Save Exam with Batches Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const activeCategory =
        form.category === "custom" ? form.customCategory.trim() : form.category;
      if (!activeCategory) {
        throw new Error("Please specify the exam folder/category");
      }

      const parsed = schema.parse({
        category: activeCategory,
        subjectName: form.subjectName,
        exam_date: form.exam_date,
        session: form.session,
        batchSelections: form.batchSelections,
      });

      return saveExamWithBatches({
        id: form.id,
        category: parsed.category,
        subjectName: parsed.subjectName,
        exam_date: parsed.exam_date,
        session: parsed.session,
        batchSelections: parsed.batchSelections,
      });
    },
    onSuccess: () => {
      toast.success(form.id ? "Exam updated successfully" : "Exam scheduled successfully");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["exams_detailed"] });
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof z.ZodError
          ? error.issues[0]?.message ?? "Invalid input"
          : error instanceof Error
            ? error.message
            : "Could not save exam",
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: deleteExam,
    onSuccess: () => {
      toast.success("Exam deleted");
      void queryClient.invalidateQueries({ queryKey: ["exams_detailed"] });
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: () => toast.error("Delete failed"),
  });

  const openNewExam = () => {
    setEditingExam(null);
    setForm({
      ...EMPTY_FORM,
      category: selectedFolder !== "all" ? selectedFolder : "Mid Semester",
    });
    setCourseFilterInDialog("all");
    setOpen(true);
  };

  const openEditExam = (exam: ExamDetailed) => {
    setEditingExam(exam);
    const isCustomCat = !DEFAULT_CATEGORIES.includes(exam.category);
    setForm({
      id: exam.id,
      category: isCustomCat ? "custom" : exam.category,
      customCategory: isCustomCat ? exam.category : "",
      subjectName: exam.subjectName || exam.name,
      exam_date: exam.exam_date,
      session: (exam.session as "morning" | "afternoon" | "evening") || "morning",
      batchSelections: exam.groups.map((g) => ({
        course_id: g.course_id,
        batch_id: g.batch_id,
      })),
    });
    setCourseFilterInDialog("all");
    setOpen(true);
  };

  const toggleBatch = (course_id: string, batch_id: string) => {
    setForm((prev) => {
      const exists = prev.batchSelections.some(
        (b) => b.course_id === course_id && b.batch_id === batch_id,
      );
      if (exists) {
        return {
          ...prev,
          batchSelections: prev.batchSelections.filter(
            (b) => !(b.course_id === course_id && b.batch_id === batch_id),
          ),
        };
      } else {
        return {
          ...prev,
          batchSelections: [...prev.batchSelections, { course_id, batch_id }],
        };
      }
    });
  };

  // Batches displayed in the dialog selector
  const dialogBatches = useMemo(() => {
    if (courseFilterInDialog === "all") return batches;
    return batches.filter((b) => b.course_id === courseFilterInDialog);
  }, [batches, courseFilterInDialog]);

  return (
    <AdminLayout
      title="Examinations"
      description="Manage exam terms, folders, papers, enrolled batches with student counts & clash detection"
    >
      <div className="space-y-5">
        {/* Top Folders / Term Bar */}
        <div className="panel p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">
                Folder:
              </span>
              <Button
                variant={selectedFolder === "all" ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setSelectedFolder("all")}
              >
                <Folder className="size-3.5" />
                All Folders
                <Badge variant="secondary" className="ml-1 text-xs py-0 px-1.5">
                  {exams.length}
                </Badge>
              </Button>

              {allCategories.map((cat) => {
                const count = exams.filter((e) => e.category === cat).length;
                return (
                  <Button
                    key={cat}
                    variant={selectedFolder === cat ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSelectedFolder(cat)}
                  >
                    <Folder className="size-3.5" />
                    {cat}
                    <Badge variant="secondary" className="ml-1 text-xs py-0 px-1.5">
                      {count}
                    </Badge>
                  </Button>
                );
              })}
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative w-48 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search subject or batch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-9"
                />
              </div>

              <Button onClick={openNewExam} className="gap-1.5 shrink-0">
                <Plus className="size-4" /> Add Exam
              </Button>
            </div>
          </div>
        </div>

        {/* Exams Table Panel */}
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-muted/30">
            <div className="flex items-center gap-2">
              <Folder className="size-4 text-muted-foreground" />
              <span className="font-semibold text-sm">
                {selectedFolder === "all" ? "All Scheduled Examinations" : `${selectedFolder} Folder`}
              </span>
              <span className="text-xs text-muted-foreground">({filteredExams.length} papers)</span>
            </div>
          </div>

          {examsLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredExams.length === 0 ? (
            <div className="p-12 text-center">
              <FolderPlus className="mx-auto size-10 text-muted-foreground/60 mb-3" />
              <h3 className="font-semibold text-base text-foreground">No Examinations Found</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-sm mx-auto">
                {selectedFolder === "all"
                  ? "No exams are scheduled yet. Add your first exam sitting with batch enrollment."
                  : `No exams found under the "${selectedFolder}" folder. Click below to add one.`}
              </p>
              <Button onClick={openNewExam} className="gap-1.5">
                <Plus className="size-4" /> Add Exam Sitting
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Folder & Subject</th>
                    <th className="px-5 py-3 font-semibold">Appearing Batches & Students</th>
                    <th className="px-5 py-3 font-semibold">Date & Session</th>
                    <th className="px-5 py-3 font-semibold">Clash Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredExams.map((exam) => {
                    const hasClash = exam.clashes && exam.clashes.length > 0;
                    return (
                      <tr key={exam.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted border border-border text-foreground font-mono">
                              {exam.category}
                            </span>
                            <span className="font-semibold text-foreground text-sm">
                              {exam.subjectName}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="space-y-1">
                            {exam.groups.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">No batches attached</span>
                            ) : (
                              exam.groups.map((g) => {
                                const bCount = batchCounts[g.batch_id] || 0;
                                const bLabel = `${g.courses?.code || ""} ${g.batches?.name || ""}`.trim();
                                return (
                                  <div key={g.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <span className="font-medium text-foreground">{bLabel}</span>
                                    <span className="font-mono text-muted-foreground text-[11px]">
                                      ({bCount} students)
                                    </span>
                                  </div>
                                );
                              })
                            )}
                            <div className="pt-0.5">
                              <span className="text-[11px] font-semibold text-primary font-mono">
                                Total: ({exam.totalStudents} students)
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs text-foreground font-medium">
                            <Calendar className="size-3.5 text-muted-foreground" />
                            {exam.exam_date}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground capitalize mt-0.5">
                            <Clock className="size-3 text-muted-foreground" />
                            {exam.session}
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          {hasClash ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
                              <AlertTriangle className="size-3.5 shrink-0" />
                              <span>Clash: {exam.clashes![0].batchName} in {exam.clashes![0].otherExamName}</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="size-3.5" />
                              <span>✓ No clash</span>
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-right whitespace-nowrap space-x-1">
                          <Button asChild variant="outline" size="sm" className="gap-1.5">
                            <Link
                              to="/exams/seating"
                              search={{
                                date: exam.exam_date,
                                session: exam.session,
                                examId: exam.id,
                              }}
                            >
                              <Armchair className="size-3.5" /> Seating
                            </Link>
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => openEditExam(exam)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:bg-destructive/10"
                            onClick={() => removeMutation.mutate(exam.id)}
                            disabled={removeMutation.isPending}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Examination Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExam ? "Edit Examination Details" : "New Examination Details"}</DialogTitle>
            <DialogDescription>
              Define exam category/folder, subject, schedule date & session, and select appearing batches.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Category / Folder Selection */}
            <div className="space-y-2">
              <Label>Examination Folder / Term</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DEFAULT_CATEGORIES.map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    variant={form.category === cat ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setForm({ ...form, category: cat })}
                  >
                    {cat}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={form.category === "custom" ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => setForm({ ...form, category: "custom" })}
                >
                  + Custom Folder
                </Button>
              </div>

              {form.category === "custom" && (
                <div className="pt-2">
                  <Input
                    placeholder="e.g. Unit Test 1, Practical Examination, Re-Exam..."
                    value={form.customCategory}
                    onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
                    className="text-sm"
                  />
                </div>
              )}
            </div>

            {/* Subject / Paper Name */}
            <div className="space-y-2">
              <Label htmlFor="subject-name">Subject / Exam Paper Name</Label>
              <Input
                id="subject-name"
                placeholder="e.g. Computer Networks, Database Management Systems, CS301..."
                value={form.subjectName}
                onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
              />
            </div>

            {/* Date and Session */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exam-date">Exam Date</Label>
                <Input
                  id="exam-date"
                  type="date"
                  value={form.exam_date}
                  onChange={(e) => setForm({ ...form, exam_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Session</Label>
                <Select
                  value={form.session}
                  onValueChange={(val: "morning" | "afternoon" | "evening") =>
                    setForm({ ...form, session: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning (09:30 AM - 12:30 PM)</SelectItem>
                    <SelectItem value="afternoon">Afternoon (01:30 PM - 04:30 PM)</SelectItem>
                    <SelectItem value="evening">Evening (05:00 PM - 08:00 PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Appearing Batches & Student Counts */}
            <div className="space-y-2.5 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Select Appearing Batches</Label>
                  <p className="text-xs text-muted-foreground">
                    Active student counts appear in brackets beside each batch.
                  </p>
                </div>
                {courses.length > 1 && (
                  <Select
                    value={courseFilterInDialog}
                    onValueChange={setCourseFilterInDialog}
                  >
                    <SelectTrigger className="w-36 h-8 text-xs">
                      <SelectValue placeholder="All Courses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Courses</SelectItem>
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="rounded-lg border border-border p-3 max-h-48 overflow-y-auto space-y-2 bg-muted/20">
                {batches.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No batches found. Please add courses and batches first.
                  </p>
                ) : (
                  dialogBatches.map((b) => {
                    const isChecked = form.batchSelections.some((sel) => sel.batch_id === b.id);
                    const count = batchCounts[b.id] || 0;
                    const courseCode = b.courses?.code || "";
                    const label = `${courseCode} ${b.name}`.trim();

                    return (
                      <label
                        key={b.id}
                        className="flex items-center justify-between gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleBatch(b.course_id, b.id)}
                          />
                          <span className="font-medium text-foreground">{label}</span>
                        </div>
                        <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded text-[11px]">
                          ({count} students)
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-md px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  Selected Batches: <strong className="text-foreground">{form.batchSelections.length}</strong>
                </span>
                <span className="font-mono font-semibold text-primary">
                  Total Enrolled: ({totalFormStudents} students)
                </span>
              </div>
            </div>

            {/* Real-time Clash Detection Warning */}
            {formClashes.length > 0 ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2.5">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="font-semibold block">⚠️ Schedule Clash Detected!</strong>
                  {formClashes.map((c, i) => (
                    <p key={i}>
                      Batch <span className="underline font-medium">{c.batchName}</span> already has another exam scheduled (
                      <strong>{c.otherExamName}</strong>) on {c.examDate} ({c.session}).
                    </p>
                  ))}
                  <p className="text-[11px] text-destructive/80 mt-1">
                    Please change the date, session, or select non-conflicting batches.
                  </p>
                </div>
              </div>
            ) : form.batchSelections.length > 0 && form.exam_date ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>✓ No scheduling clash. All selected batches are free on this date & session.</span>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || formClashes.length > 0}
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
              {editingExam ? "Update Exam Sitting" : "Schedule Exam Sitting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}