import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Armchair,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Folder,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Shuffle,
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
import { getDetailedSubjectStudentCounts, listSubjects, type Subject } from "@/lib/subjects";
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
  secondarySubjectName?: string;
  exam_date: string;
  session: "morning" | "afternoon" | "evening";
  batchSelections: Array<{ course_id: string; batch_id: string }>;
};

const EMPTY_FORM: FormState = {
  category: "Mid Semester",
  customCategory: "",
  subjectName: "",
  secondarySubjectName: "",
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

  const [showMultipleBatches, setShowMultipleBatches] = useState(false);

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

  const { data: allSubjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => listSubjects(),
  });

  const { data: subjectCountData = { bySubjectId: {}, byCourseAndBatch: {} } } = useQuery({
    queryKey: ["detailed_subject_student_counts"],
    queryFn: getDetailedSubjectStudentCounts,
  });

  const primaryBatch = useMemo(() => {
    const first = form.batchSelections[0];
    if (!first) return null;
    return batches.find((b) => b.id === first.batch_id) || null;
  }, [form.batchSelections, batches]);

  const primaryBatchId = primaryBatch?.id || "";

  const secondaryBatch = useMemo(() => {
    const second = form.batchSelections[1];
    if (!second) return null;
    return batches.find((b) => b.id === second.batch_id) || null;
  }, [form.batchSelections, batches]);

  const secondaryBatchId = secondaryBatch?.id || "";

  // Helper to check if a subject strictly belongs to a specific batch
  const isSubjectForBatch = (s: Subject, targetBatch: typeof primaryBatch) => {
    if (!targetBatch) return false;
    // 1. Direct match on batch_id
    if (s.batch_id && s.batch_id === targetBatch.id) {
      return true;
    }
    // 2. Direct match on batch name (case-insensitive)
    if (s.batches?.name && s.batches.name.trim().toLowerCase() === targetBatch.name.trim().toLowerCase()) {
      return true;
    }
    // 3. Fallback: only if the subject has NO batch assigned at all (s.batch_id is null/empty)
    // AND it matches the course_id of the batch
    if (!s.batch_id && !s.batches?.name && s.course_id && s.course_id === targetBatch.course_id) {
      return true;
    }
    return false;
  };

  // Strictly filter subjects to the selected primary course and batch year
  const batchSubjects = useMemo(() => {
    if (!primaryBatch) return [];
    const filtered = allSubjects.filter((s) => isSubjectForBatch(s, primaryBatch));

    return filtered.map((s) => {
      const count =
        subjectCountData.bySubjectId[s.id] ??
        (s.course_id ? subjectCountData.byCourseAndBatch[`${s.course_id}_${primaryBatch.id}`] : null) ??
        (batchCounts[primaryBatch.id] || 0);

      const branchCode = s.courses?.code || "";
      const codePrefix = s.code ? `[${s.code}] ` : "";

      return {
        id: s.id,
        code: s.code || "",
        name: s.name,
        studentCount: count,
        branchCode,
        batchName: primaryBatch.name,
        label: `${codePrefix}${s.name}`,
      };
    });
  }, [allSubjects, primaryBatch, subjectCountData, batchCounts]);

  // Strictly filter subjects for secondary batch (if alternate seating merge is active)
  const secondaryBatchSubjects = useMemo(() => {
    if (!secondaryBatch) return [];
    const filtered = allSubjects.filter((s) => isSubjectForBatch(s, secondaryBatch));

    return filtered.map((s) => {
      const count =
        subjectCountData.bySubjectId[s.id] ??
        (s.course_id ? subjectCountData.byCourseAndBatch[`${s.course_id}_${secondaryBatch.id}`] : null) ??
        (batchCounts[secondaryBatch.id] || 0);

      const branchCode = s.courses?.code || "";
      const codePrefix = s.code ? `[${s.code}] ` : "";

      return {
        id: s.id,
        code: s.code || "",
        name: s.name,
        studentCount: count,
        branchCode,
        batchName: secondaryBatch.name,
        label: `${codePrefix}${s.name}`,
      };
    });
  }, [allSubjects, secondaryBatch, subjectCountData, batchCounts]);

  // Subject suggestions for 1-click select (strictly matching the primary batch)
  const popularSubjects = useMemo(() => {
    if (!primaryBatch) return [];
    const seen = new Set<string>();
    const list: string[] = [];

    for (const s of allSubjects) {
      if (isSubjectForBatch(s, primaryBatch)) {
        const n = s.name.trim();
        if (n && !seen.has(n.toLowerCase())) {
          seen.add(n.toLowerCase());
          list.push(n);
        }
      }
    }

    return list;
  }, [primaryBatch, allSubjects]);

  // Subject suggestions for 1-click select (strictly matching the secondary batch)
  const secondaryPopularSubjects = useMemo(() => {
    if (!secondaryBatch) return [];
    const seen = new Set<string>();
    const list: string[] = [];

    for (const s of allSubjects) {
      if (isSubjectForBatch(s, secondaryBatch)) {
        const n = s.name.trim();
        if (n && !seen.has(n.toLowerCase())) {
          seen.add(n.toLowerCase());
          list.push(n);
        }
      }
    }

    return list;
  }, [secondaryBatch, allSubjects]);

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

  // Exact student count for the scheduled exam
  const effectiveExamStudentCount = useMemo(() => {
    return totalFormStudents;
  }, [totalFormStudents]);

  // Save Exam with Batches Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const activeCategory =
        form.category === "custom" ? form.customCategory.trim() : form.category;
      if (!activeCategory) {
        throw new Error("Please specify the exam folder/category");
      }

      // If alternate seating with 2 distinct batches is scheduled as new:
      if (secondaryBatch && form.batchSelections.length >= 2 && !form.id) {
        if (!form.subjectName.trim()) {
          throw new Error(`Please specify paper name for Batch 1 (${primaryBatch?.name || "Primary"})`);
        }
        const secondaryPaper = (form.secondarySubjectName || form.subjectName).trim();
        if (!secondaryPaper) {
          throw new Error(`Please specify paper name for Batch 2 (${secondaryBatch?.name || "Secondary"})`);
        }

        // Schedule both examinations on the exact same date & session so each batch has its specific paper
        await saveExamWithBatches({
          category: activeCategory,
          subjectName: form.subjectName.trim(),
          exam_date: form.exam_date,
          session: form.session,
          batchSelections: [form.batchSelections[0]],
        });

        await saveExamWithBatches({
          category: activeCategory,
          subjectName: secondaryPaper,
          exam_date: form.exam_date,
          session: form.session,
          batchSelections: [form.batchSelections[1]],
        });

        return { count: 2, batch1Name: primaryBatch?.name, batch2Name: secondaryBatch?.name, p1: form.subjectName.trim(), p2: secondaryPaper };
      }

      const parsed = schema.parse({
        category: activeCategory,
        subjectName: form.subjectName,
        exam_date: form.exam_date,
        session: form.session,
        batchSelections: form.batchSelections,
      });

      const effectiveSubject =
        form.id && secondaryBatch && form.secondarySubjectName && form.secondarySubjectName.trim()
          ? `${parsed.subjectName.trim()} / ${form.secondarySubjectName.trim()}`
          : parsed.subjectName;

      return saveExamWithBatches({
        id: form.id,
        category: parsed.category,
        subjectName: effectiveSubject,
        exam_date: parsed.exam_date,
        session: parsed.session,
        batchSelections: parsed.batchSelections,
      });
    },
    onSuccess: (res: any) => {
      if (res?.count === 2) {
        toast.success(
          `Scheduled both papers: "${res.p1}" (${res.batch1Name}) & "${res.p2}" (${res.batch2Name}) on ${form.exam_date} (${form.session}) for Alternate Seating!`,
        );
      } else {
        toast.success(form.id ? "Exam updated successfully" : "Exam scheduled successfully");
      }
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
    setShowMultipleBatches(false);
    setForm({
      ...EMPTY_FORM,
      category: selectedFolder !== "all" ? selectedFolder : "Mid Semester",
    });
    setCourseFilterInDialog("all");
    setOpen(true);
  };

  const openEditExam = (exam: ExamDetailed) => {
    setEditingExam(exam);
    setShowMultipleBatches(exam.groups.length > 1);
    const isCustomCat = !DEFAULT_CATEGORIES.includes(exam.category);
    const parts = (exam.subjectName || exam.name || "").split(/\s*[/&]\s*/);
    setForm({
      id: exam.id,
      category: isCustomCat ? "custom" : exam.category,
      customCategory: isCustomCat ? exam.category : "",
      subjectName: parts[0] || exam.subjectName || exam.name,
      secondarySubjectName: parts[1] || "",
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

  const setPrimaryBatch = (batchId: string) => {
    const b = batches.find((x) => x.id === batchId);
    if (!b) return;
    setForm((prev) => {
      const second = prev.batchSelections[1];
      const newSelections = [{ course_id: b.course_id, batch_id: b.id }];
      if (second && second.batch_id !== b.id) {
        newSelections.push(second);
      }
      return {
        ...prev,
        subjectName: "",
        batchSelections: newSelections,
      };
    });
  };

  const setSecondaryBatch = (batchId: string) => {
    if (batchId === "none" || !batchId) {
      setForm((prev) => ({
        ...prev,
        secondarySubjectName: "",
        batchSelections: prev.batchSelections.slice(0, 1),
      }));
      return;
    }
    const b = batches.find((x) => x.id === batchId);
    if (!b) return;
    setForm((prev) => {
      const primary = prev.batchSelections[0];
      if (!primary) {
        return {
          ...prev,
          secondarySubjectName: "",
          batchSelections: [{ course_id: b.course_id, batch_id: b.id }],
        };
      }
      return {
        ...prev,
        secondarySubjectName: prev.secondarySubjectName || "",
        batchSelections: [primary, { course_id: b.course_id, batch_id: b.id }],
      };
    });
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
                    <th className="px-4 py-3 font-semibold">Folder & Paper</th>
                    <th className="px-4 py-3 font-semibold">Date & Session</th>
                    <th className="px-4 py-3 font-semibold">Appearing Batches</th>
                    <th className="px-4 py-3 font-semibold">Seating Status</th>
                    <th className="px-4 py-3 font-semibold">Seating Type</th>
                    <th className="px-4 py-3 font-semibold">Schedule Clash</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredExams.map((exam) => {
                    const hasClash = exam.clashes && exam.clashes.length > 0;
                    const isPlanDone = exam.seatingStatus === "done";
                    const isAlternate =
                      exam.seatingStrategy === "alternate" ||
                      exam.seatingStrategy === "alternate_columns";

                    return (
                      <tr key={exam.id} className="hover:bg-muted/30 transition-colors">
                        {/* 1. Folder & Paper */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted border border-border text-foreground font-mono">
                              {exam.category}
                            </span>
                            <div className="font-semibold text-foreground text-sm">
                              {exam.subjectName}
                            </div>
                          </div>
                        </td>

                        {/* 2. Date & Session */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs text-foreground font-medium">
                            <Calendar className="size-3.5 text-muted-foreground" />
                            {exam.exam_date}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground capitalize mt-0.5">
                            <Clock className="size-3 text-muted-foreground" />
                            {exam.session}
                          </div>
                        </td>

                        {/* 3. Appearing Batches */}
                        <td className="px-4 py-3.5">
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
                                Total: {exam.totalStudents} students
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 4. Seating Status (Done vs Pending) */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {isPlanDone ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="size-3.5" /> Seating Done
                              </span>
                              <div className="text-[11px] text-muted-foreground mt-1 font-mono">
                                {exam.seatedCount} seated in {exam.roomsUsed} room{exam.roomsUsed === 1 ? "" : "s"}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25">
                                <Clock className="size-3.5" /> Plan Pending
                              </span>
                              <div className="text-[11px] text-muted-foreground mt-1">
                                Seating not generated
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 5. Seating Type (Alternate vs Sequential) */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {isPlanDone ? (
                            isAlternate ? (
                              <div>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
                                  <Shuffle className="size-3.5" /> Alternate (Col-wise)
                                </span>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  Col 1 ⇄ Col 2 interleaved
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30">
                                  <BookOpen className="size-3.5" /> Sequential
                                </span>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  Standard continuous fill
                                </div>
                              </div>
                            )
                          ) : exam.groups.length >= 2 ? (
                            <div>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30">
                                <Shuffle className="size-3.5" /> Alternate Ready
                              </span>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {exam.groups.length} batches merged
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                                <BookOpen className="size-3.5" /> Sequential (1 Batch)
                              </span>
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                Single batch seating
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 6. Clash Status */}
                        <td className="px-4 py-3.5">
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

                        {/* 7. Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-1.5">
                          {isPlanDone ? (
                            <Button asChild variant="default" size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-medium shadow-xs">
                              <Link
                                to="/exams/seating"
                                search={{
                                  date: exam.exam_date,
                                  session: exam.session,
                                  examId: exam.id,
                                }}
                              >
                                <Eye className="size-3.5" /> View Plan
                              </Link>
                            </Button>
                          ) : (
                            <Button asChild variant="outline" size="sm" className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10 h-8 text-xs font-medium">
                              <Link
                                to="/exams/seating"
                                search={{
                                  date: exam.exam_date,
                                  session: exam.session,
                                  examId: exam.id,
                                }}
                              >
                                <Armchair className="size-3.5" /> Make Seating
                              </Link>
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => openEditExam(exam)}
                            title="Edit Exam"
                          >
                            <Pencil className="size-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:bg-destructive/10"
                            onClick={() => removeMutation.mutate(exam.id)}
                            disabled={removeMutation.isPending}
                            title="Delete Exam"
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <BookOpen className="size-5 text-primary" />
              {editingExam ? "Edit Examination Details" : "New Examination Scheduling"}
            </DialogTitle>
            <DialogDescription>
              First enter exam/paper name & schedule date, then choose batches and merge for alternate seating.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* ── STEP 1: Examination Folder / Term (First Step) ── */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Folder className="size-4 text-primary" />
                  <span>1. Examination Folder / Term *</span>
                </Label>
                <Badge variant="outline" className="font-semibold text-[11px] bg-primary/10 text-primary border-primary/25">
                  Folder: {form.category === "custom" ? (form.customCategory || "Custom") : form.category}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {DEFAULT_CATEGORIES.map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    variant={form.category === cat ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-8 font-medium"
                    onClick={() => setForm({ ...form, category: cat })}
                  >
                    {cat}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={form.category === "custom" ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-8 font-medium"
                  onClick={() => setForm({ ...form, category: "custom" })}
                >
                  + Custom
                </Button>
              </div>

              {form.category === "custom" && (
                <div className="pt-1">
                  <Input
                    placeholder="Enter custom folder name (e.g. Unit Test 1, Re-Exam, Practical)..."
                    value={form.customCategory}
                    onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
                    className="text-xs bg-background h-8.5 font-medium"
                  />
                </div>
              )}
            </div>

            {/* ── STEP 2: Course with Batch Year (Second Step) ── */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Users className="size-4 text-primary" />
                  <span>2. Course with Batch Year *</span>
                </Label>
                {primaryBatch && (
                  <Badge className="font-mono text-xs bg-primary/10 text-primary border-primary/20">
                    👥 {batchCounts[primaryBatch.id] || 0} Students
                  </Badge>
                )}
              </div>

              <div className="space-y-1.5">
                <Select
                  value={primaryBatchId}
                  onValueChange={(val) => {
                    setPrimaryBatch(val);
                    // Reset subject if it was previously chosen
                    setForm((prev) => ({ ...prev, subjectName: "" }));
                  }}
                >
                  <SelectTrigger className="w-full bg-background font-medium h-10 text-xs">
                    <SelectValue placeholder="-- Select Course & Batch Year (e.g. [BTECH-CSE] Batch 2024-2028) --" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {batches.map((b) => {
                      const count = batchCounts[b.id] || 0;
                      const courseCode = b.courses?.code || "";
                      const label = `${courseCode ? `[${courseCode}] ` : ""}${b.name}`;
                      return (
                        <SelectItem key={b.id} value={b.id}>
                          <div className="flex items-center justify-between w-full gap-4 text-xs">
                            <span className="font-semibold text-foreground">{label}</span>
                            <span className="text-muted-foreground font-mono">
                              ({count} students)
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Secondary Batch Merge (Optional for Alternate Seating) */}
              {batches.length > 1 && (
                <div className="pt-2 border-t border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant={showMultipleBatches || form.batchSelections.length > 1 ? "secondary" : "outline"}
                      size="sm"
                      className="h-7 text-xs font-semibold gap-1.5 border-dashed"
                      onClick={() => setShowMultipleBatches((v) => !v)}
                    >
                      <Shuffle className="size-3 text-primary" />
                      {showMultipleBatches || form.batchSelections.length > 1
                        ? "✓ 2nd Batch Options"
                        : "➕ Merge 2nd Batch for Alternate Seating (Optional)"}
                    </Button>

                    {form.batchSelections.length >= 2 && (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 font-medium text-[11px]">
                        🔀 Alternate Ready (2 Batches)
                      </Badge>
                    )}
                  </div>

                  {(showMultipleBatches || form.batchSelections.length > 1) && (
                    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <span className="text-[11px] font-medium text-foreground block">
                        Secondary Batch (Column 2, 4, 6... for Alternate Seating):
                      </span>
                      <Select
                        value={secondaryBatchId || "none"}
                        onValueChange={setSecondaryBatch}
                      >
                        <SelectTrigger className="w-full bg-background font-medium h-9 text-xs">
                          <SelectValue placeholder="-- Select 2nd Batch to Alternate With --" />
                        </SelectTrigger>
                        <SelectContent className="max-h-56 overflow-y-auto">
                          <SelectItem value="none">-- None (Single Batch Only) --</SelectItem>
                          {batches
                            .filter((b) => b.id !== primaryBatchId)
                            .map((b) => {
                              const count = batchCounts[b.id] || 0;
                              const courseCode = b.courses?.code || "";
                              const label = `${courseCode ? `[${courseCode}] ` : ""}${b.name}`;
                              return (
                                <SelectItem key={b.id} value={b.id}>
                                  <div className="flex items-center justify-between w-full gap-4 text-xs">
                                    <span>{label}</span>
                                    <span className="text-muted-foreground font-mono">
                                      ({count} students)
                                    </span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── STEP 3: Subject / Paper (Strictly for Selected Course & Batch) ── */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="exam-subject-name" className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <BookOpen className="size-4 text-primary" />
                  <span>3. Examination Subject / Paper Name *</span>
                </Label>
                {form.subjectName && (
                  <Badge variant="outline" className="font-semibold text-[11px] bg-primary/10 text-primary border-primary/25">
                    {secondaryBatch ? `P1: ${form.subjectName}` : `Paper: ${form.subjectName}`}
                  </Badge>
                )}
              </div>

              {!primaryBatch ? (
                <div className="p-3.5 rounded-lg border border-dashed border-border bg-background/50 text-center space-y-1">
                  <p className="text-xs font-semibold text-foreground">
                    👆 Please select Course with Batch Year in Step 2 above first.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Once selected, only subjects registered for that course &amp; batch will be displayed here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Primary Batch Paper Box */}
                  <div className="p-3.5 rounded-lg border border-border bg-card space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-primary" />
                        <span>Paper for Batch 1 ({primaryBatch.courses?.code || ""} {primaryBatch.name}) *</span>
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {batchCounts[primaryBatch.id] || 0} students
                      </span>
                    </div>

                    <Select
                      value={
                        batchSubjects.some((s) => s.name === form.subjectName)
                          ? form.subjectName
                          : form.subjectName
                            ? "__custom__"
                            : ""
                      }
                      onValueChange={(val) => {
                        if (val === "__custom__") {
                          setForm((prev) => ({ ...prev, subjectName: "" }));
                        } else {
                          setForm((prev) => ({ ...prev, subjectName: val }));
                        }
                      }}
                    >
                      <SelectTrigger className="w-full bg-background font-medium h-9 text-xs">
                        <SelectValue
                          placeholder={
                            batchSubjects.length > 0
                              ? `-- Select Subject for ${primaryBatch.courses?.code || ""} ${primaryBatch.name} (${batchSubjects.length} subjects found) --`
                              : `-- No subjects found for ${primaryBatch.name}. Type custom paper name below --`
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {batchSubjects.map((s) => (
                          <SelectItem key={s.id} value={s.name} className="py-1.5 text-xs">
                            <div className="flex items-center justify-between w-full gap-3">
                              <span className="font-semibold text-foreground">{s.label}</span>
                              <span className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[10px] shrink-0 font-medium">
                                {s.studentCount} students {s.branchCode ? `(${s.branchCode})` : ""}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__" className="text-primary font-semibold border-t border-border mt-1 pt-1 text-xs">
                          ✏️ + Type other / custom paper name...
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      id="exam-subject-name"
                      placeholder={`Enter paper name for ${primaryBatch.name}...`}
                      value={form.subjectName}
                      onChange={(e) => setForm({ ...form, subjectName: e.target.value })}
                      className="bg-background text-xs h-9 font-medium"
                    />

                    {popularSubjects.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[11px] font-medium text-muted-foreground mr-1">
                          Quick Select ({primaryBatch.name}):
                        </span>
                        {popularSubjects.map((sName) => (
                          <button
                            key={sName}
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, subjectName: sName }))}
                            className={`text-[11px] px-2 py-0.5 rounded-md border transition-all ${
                              form.subjectName.toLowerCase() === sName.toLowerCase()
                                ? "bg-primary text-primary-foreground border-primary font-semibold shadow-xs"
                                : "bg-background hover:bg-muted text-foreground border-border"
                            }`}
                          >
                            {sName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Secondary Batch Paper Box (When 2nd Batch is Merged for Alternate Seating) */}
                  {secondaryBatch && (
                    <div className="p-3.5 rounded-lg border border-primary/30 bg-primary/10 dark:bg-primary/20 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Shuffle className="size-3.5 text-primary" />
                          <span>Paper for Batch 2 ({secondaryBatch.courses?.code || ""} {secondaryBatch.name}) *</span>
                        </span>
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-mono font-bold">
                          🔀 Alternate Batch ({batchCounts[secondaryBatch.id] || 0} students)
                        </Badge>
                      </div>

                      <Select
                        value={
                          secondaryBatchSubjects.some((s) => s.name === (form.secondarySubjectName || ""))
                            ? form.secondarySubjectName
                            : form.secondarySubjectName
                              ? "__custom__"
                              : ""
                        }
                        onValueChange={(val) => {
                          if (val === "__custom__") {
                            setForm((prev) => ({ ...prev, secondarySubjectName: "" }));
                          } else {
                            setForm((prev) => ({ ...prev, secondarySubjectName: val }));
                          }
                        }}
                      >
                        <SelectTrigger className="w-full bg-background font-medium h-9 text-xs">
                          <SelectValue
                            placeholder={
                              secondaryBatchSubjects.length > 0
                                ? `-- Select Subject for ${secondaryBatch.courses?.code || ""} ${secondaryBatch.name} (${secondaryBatchSubjects.length} subjects found) --`
                                : `-- No subjects found for ${secondaryBatch.name}. Type custom paper name below --`
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {secondaryBatchSubjects.map((s) => (
                            <SelectItem key={s.id} value={s.name} className="py-1.5 text-xs">
                              <div className="flex items-center justify-between w-full gap-3">
                                <span className="font-semibold text-foreground">{s.label}</span>
                                <span className="font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded text-[10px] shrink-0 font-medium">
                                  {s.studentCount} students
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                          <SelectItem value="__custom__" className="text-primary font-semibold border-t border-border mt-1 pt-1 text-xs">
                            ✏️ + Type other / custom paper name...
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <Input
                        id="exam-secondary-subject-name"
                        placeholder={`Enter paper name for ${secondaryBatch.name}...`}
                        value={form.secondarySubjectName || ""}
                        onChange={(e) => setForm({ ...form, secondarySubjectName: e.target.value })}
                        className="bg-background text-xs h-9 font-medium"
                      />

                      {secondaryPopularSubjects.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[11px] font-medium text-muted-foreground mr-1">
                            Quick Select ({secondaryBatch.name}):
                          </span>
                          {secondaryPopularSubjects.map((sName) => (
                            <button
                              key={sName}
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, secondarySubjectName: sName }))}
                              className={`text-[11px] px-2 py-0.5 rounded-md border transition-all ${
                                (form.secondarySubjectName || "").toLowerCase() === sName.toLowerCase()
                                  ? "bg-primary text-primary-foreground border-primary font-semibold shadow-xs"
                                  : "bg-background hover:bg-muted text-foreground border-border"
                              }`}
                            >
                              {sName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── STEP 4: Exam Date & Session Time (Fourth Step) ── */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Calendar className="size-4 text-primary" />
                  <span>4. Exam Date &amp; Session Time *</span>
                </Label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="exam-date" className="text-xs font-semibold flex items-center gap-1 text-muted-foreground">
                    <Calendar className="size-3.5 text-muted-foreground" />
                    <span>Exam Date</span>
                  </Label>
                  <Input
                    id="exam-date"
                    type="date"
                    value={form.exam_date}
                    onChange={(e) => setForm({ ...form, exam_date: e.target.value })}
                    className="bg-background h-9 text-xs font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1 text-muted-foreground">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span>Session Time</span>
                  </Label>
                  <Select
                    value={form.session}
                    onValueChange={(val: "morning" | "afternoon" | "evening") =>
                      setForm({ ...form, session: val })
                    }
                  >
                    <SelectTrigger className="bg-background h-9 text-xs font-medium">
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
                <span>✓ No scheduling clash. All selected batches are free on this date &amp; session.</span>
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