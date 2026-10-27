import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderPlus,
  GraduationCap,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
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
import { DataPagination } from "@/components/shared/DataPagination";
import {
  createBatch,
  createCourse,
  createSection,
  deleteBatch,
  deleteCourse,
  deleteSection,
  listBatches,
  listCourses,
  listSections,
  updateBatch,
  updateCourse,
  updateSection,
  type Batch,
  type Course,
  type Section,
} from "@/lib/db";
import { normalizeSectionName } from "@/lib/student-import";
import { openWindow, usePopupRefresh } from "@/lib/popup";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/courses")({
  head: () => ({
    meta: [
      { title: "Academic Structure (Courses, Batches & Sections) | Exam Branch" },
      {
        name: "description",
        content:
          "Manage complete university academic hierarchy: Courses, Batches, and Sections in one unified manager.",
      },
      { property: "og:title", content: "Academic Structure | Exam Branch" },
      { property: "og:description", content: "Unified course, batch, and section management." },
    ],
  }),
  component: CoursesPage,
});

const courseSchema = z.object({
  name: z.string().trim().min(2, "Course name is required").max(120),
  code: z.string().trim().min(2, "Course code is required").max(20),
});

const batchSchema = z.object({
  name: z.string().trim().min(2, "Batch name is required").max(60),
  start_year: z.number().int().min(1950, "Invalid start year").max(2100),
  end_year: z.number().int().min(1950, "Invalid end year").max(2100),
});

const sectionSchema = z.object({
  batch_id: z.string().uuid("Select a valid batch"),
  name: z.string().trim().min(1, "Section name is required").max(60),
});

const PAGE_SIZE = 10;

function CoursesPage() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  // View state
  const [viewMode, setViewMode] = useState<"tree" | "table">("tree");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});

  // Course Dialog State
  const [openCourseDialog, setOpenCourseDialog] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseForm, setCourseForm] = useState({ name: "", code: "" });
  const [withInitialBatch, setWithInitialBatch] = useState(false);
  const [initialBatchForm, setInitialBatchForm] = useState({
    name: `${currentYear}-${currentYear + 4}`,
    start_year: currentYear,
    end_year: currentYear + 4,
    withSections: true,
  });

  // Batch Dialog State
  const [openBatchDialog, setOpenBatchDialog] = useState(false);
  const [batchTargetCourse, setBatchTargetCourse] = useState<Course | null>(null);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [batchForm, setBatchForm] = useState({
    name: `${currentYear}-${currentYear + 4}`,
    start_year: currentYear,
    end_year: currentYear + 4,
    course_id: "",
    withSections: false,
  });

  // Section Dialog State
  const [openSectionDialog, setOpenSectionDialog] = useState(false);
  const [sectionTargetBatch, setSectionTargetBatch] = useState<Batch | null>(null);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [sectionForm, setSectionForm] = useState({ name: "", batch_id: "" });

  // Quick Multi-Section Generator Dialog State
  const [openMultiSectionDialog, setOpenMultiSectionDialog] = useState(false);
  const [multiSectionBatch, setMultiSectionBatch] = useState<Batch | null>(null);
  const [multiSectionInput, setMultiSectionInput] = useState("Section A, Section B, Section C");

  // Delete Confirm Dialog State
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "course" | "batch" | "section";
    id: string;
    label: string;
  } | null>(null);

  // Queries
  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: listCourses,
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: () => listBatches(),
  });

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["sections"],
    queryFn: () => listSections(),
  });

  const { data: studentsData = [] } = useQuery({
    queryKey: ["all_student_mappings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, course_id, batch_id, section_id, status");
      if (error) return [];
      return data ?? [];
    },
  });

  // Maps for real-time counts
  const studentCounts = useMemo(() => {
    const byCourse = new Map<string, number>();
    const byBatch = new Map<string, number>();
    const bySection = new Map<string, number>();

    for (const s of studentsData) {
      if (s.course_id) byCourse.set(s.course_id, (byCourse.get(s.course_id) ?? 0) + 1);
      if (s.batch_id) byBatch.set(s.batch_id, (byBatch.get(s.batch_id) ?? 0) + 1);
      if (s.section_id) bySection.set(s.section_id, (bySection.get(s.section_id) ?? 0) + 1);
    }

    return { byCourse, byBatch, bySection };
  }, [studentsData]);

  // Group Batches by Course
  const batchesByCourse = useMemo(() => {
    const map = new Map<string, Batch[]>();
    for (const b of batches) {
      const list = map.get(b.course_id) ?? [];
      list.push(b);
      map.set(b.course_id, list);
    }
    return map;
  }, [batches]);

  // Group Sections by Batch
  const sectionsByBatch = useMemo(() => {
    const map = new Map<string, Section[]>();
    for (const s of sections) {
      const list = map.get(s.batch_id) ?? [];
      list.push(s);
      map.set(s.batch_id, list);
    }
    return map;
  }, [sections]);

  // Global counts
  const totalCoursesCount = courses.length;
  const totalBatchesCount = batches.length;
  const totalSectionsCount = sections.length;
  const totalStudentsCount = studentsData.length;

  usePopupRefresh(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["courses"] });
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["sections"] });
      void queryClient.invalidateQueries({ queryKey: ["all_student_mappings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    }, [queryClient]),
  );

  // Invalidate all related caches helper
  const invalidateAcademic = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["courses"] });
    void queryClient.invalidateQueries({ queryKey: ["batches"] });
    void queryClient.invalidateQueries({ queryKey: ["sections"] });
    void queryClient.invalidateQueries({ queryKey: ["all_student_mappings"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  }, [queryClient]);

  // Expand / collapse all courses
  const toggleAllExpanded = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    for (const c of courses) {
      next[c.id] = expand;
    }
    setExpandedCourses(next);
  };

  const isCourseExpanded = (courseId: string) => {
    if (expandedCourses[courseId] !== undefined) return expandedCourses[courseId];
    return false; // Closed by default: click to open as requested
  };

  const toggleCourseExpand = (courseId: string) => {
    setExpandedCourses((prev) => ({
      ...prev,
      [courseId]: !isCourseExpanded(courseId),
    }));
  };

  // Filter courses by search term
  const filteredCourses = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return courses;

    return courses.filter((course) => {
      const matchCourse =
        course.name.toLowerCase().includes(term) ||
        course.code.toLowerCase().includes(term);
      if (matchCourse) return true;

      const courseBatches = batchesByCourse.get(course.id) ?? [];
      const matchBatch = courseBatches.some((b) => b.name.toLowerCase().includes(term));
      if (matchBatch) return true;

      const matchSection = courseBatches.some((b) => {
        const batchSections = sectionsByBatch.get(b.id) ?? [];
        return batchSections.some((s) => s.name.toLowerCase().includes(term));
      });
      return matchSection;
    });
  }, [courses, search, batchesByCourse, sectionsByBatch]);

  const pagedCourses = filteredCourses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  // Course Mutation
  const saveCourseMut = useMutation({
    mutationFn: async () => {
      const parsed = courseSchema.parse({
        name: courseForm.name.trim(),
        code: courseForm.code.trim().toUpperCase(),
      });

      if (editingCourse) {
        return updateCourse(editingCourse.id, parsed);
      }

      const newCourse = await createCourse(parsed);

      if (withInitialBatch && initialBatchForm.name.trim()) {
        const newBatch = await createBatch({
          course_id: newCourse.id,
          name: initialBatchForm.name.trim(),
          start_year: Number(initialBatchForm.start_year),
          end_year: Number(initialBatchForm.end_year),
        });

        if (initialBatchForm.withSections) {
          await createSection({ batch_id: newBatch.id, name: "Section A" });
          await createSection({ batch_id: newBatch.id, name: "Section B" });
        }
      }

      return newCourse;
    },
    onSuccess: () => {
      toast.success(editingCourse ? "Course updated" : "Course created successfully");
      setOpenCourseDialog(false);
      invalidateAcademic();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to save course"),
  });

  // Batch Mutation
  const saveBatchMut = useMutation({
    mutationFn: async () => {
      const targetCourseId = batchTargetCourse?.id || batchForm.course_id;
      if (!targetCourseId) throw new Error("Please select a course for this batch.");

      const parsed = batchSchema.parse({
        name: batchForm.name.trim(),
        start_year: Number(batchForm.start_year),
        end_year: Number(batchForm.end_year),
      });

      if (editingBatch) {
        return updateBatch(editingBatch.id, {
          course_id: targetCourseId,
          ...parsed,
        });
      }

      const newBatch = await createBatch({
        course_id: targetCourseId,
        ...parsed,
      });

      if (batchForm.withSections) {
        await createSection({ batch_id: newBatch.id, name: "Section A" });
        await createSection({ batch_id: newBatch.id, name: "Section B" });
      }

      return newBatch;
    },
    onSuccess: (res) => {
      toast.success(editingBatch ? "Batch updated" : `Batch ${res.name} created successfully`);
      setOpenBatchDialog(false);
      invalidateAcademic();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to save batch"),
  });

  // Section Mutation
  const saveSectionMut = useMutation({
    mutationFn: async () => {
      const targetBatchId = sectionTargetBatch?.id || sectionForm.batch_id;
      if (!targetBatchId) throw new Error("Please select a batch for this section.");

      const parsed = sectionSchema.parse({
        batch_id: targetBatchId,
        name: normalizeSectionName(sectionForm.name),
      });

      if (editingSection) {
        return updateSection(editingSection.id, parsed);
      }

      return createSection(parsed);
    },
    onSuccess: (res) => {
      toast.success(editingSection ? "Section updated" : `Section "${res.name}" created`);
      setOpenSectionDialog(false);
      invalidateAcademic();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to save section"),
  });

  // Multi-Section Generator Mutation
  const generateMultiSectionsMut = useMutation({
    mutationFn: async () => {
      if (!multiSectionBatch) throw new Error("No batch selected");
      const names = multiSectionInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (names.length === 0) throw new Error("Please enter at least one section name.");

      for (const name of names) {
        await createSection({
          batch_id: multiSectionBatch.id,
          name: normalizeSectionName(name),
        });
      }
      return names.length;
    },
    onSuccess: (count) => {
      toast.success(`Created ${count} sections in ${multiSectionBatch?.name}!`);
      setOpenMultiSectionDialog(false);
      invalidateAcademic();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to generate sections"),
  });

  // Delete Mutation
  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return;
      if (deleteTarget.type === "course") {
        await deleteCourse(deleteTarget.id);
      } else if (deleteTarget.type === "batch") {
        await deleteBatch(deleteTarget.id);
      } else if (deleteTarget.type === "section") {
        await deleteSection(deleteTarget.id);
      }
    },
    onSuccess: () => {
      toast.success(`${deleteTarget?.label ?? "Item"} deleted successfully`);
      setDeleteTarget(null);
      invalidateAcademic();
    },
    onError: (err: any) => {
      toast.error(
        err?.message ||
          "Cannot delete this item because students or exams are linked to it.",
      );
    },
  });

  // ---------------------------------------------------------------------------
  // Action Openers
  // ---------------------------------------------------------------------------

  function openCreateCourse() {
    setEditingCourse(null);
    setCourseForm({ name: "", code: "" });
    setWithInitialBatch(false);
    setInitialBatchForm({
      name: `${currentYear}-${currentYear + 4}`,
      start_year: currentYear,
      end_year: currentYear + 4,
      withSections: true,
    });
    setOpenCourseDialog(true);
  }

  function openEditCourse(course: Course) {
    setEditingCourse(course);
    setCourseForm({ name: course.name, code: course.code });
    setOpenCourseDialog(true);
  }

  function openAddBatch(course?: Course) {
    setEditingBatch(null);
    setBatchTargetCourse(course ?? null);

    let startY = currentYear;
    let endY = currentYear + 4;
    if (course) {
      const existing = batchesByCourse.get(course.id) ?? [];
      if (existing.length > 0) {
        const maxEnd = Math.max(...existing.map((b) => b.end_year));
        if (maxEnd >= currentYear) {
          startY = maxEnd - 3;
          endY = maxEnd + 1;
        }
      }
    }

    setBatchForm({
      name: `${startY}-${endY}`,
      start_year: startY,
      end_year: endY,
      course_id: course?.id ?? (courses[0]?.id || ""),
      withSections: false,
    });
    setOpenBatchDialog(true);
  }

  function openEditBatch(batch: Batch, course: Course) {
    setEditingBatch(batch);
    setBatchTargetCourse(course);
    setBatchForm({
      name: batch.name,
      start_year: batch.start_year,
      end_year: batch.end_year,
      course_id: batch.course_id,
      withSections: false,
    });
    setOpenBatchDialog(true);
  }

  function openAddSection(batch: Batch) {
    setEditingSection(null);
    setSectionTargetBatch(batch);
    const existing = sectionsByBatch.get(batch.id) ?? [];
    const nextLetter = String.fromCharCode(65 + existing.length);
    setSectionForm({
      name: `Section ${nextLetter}`,
      batch_id: batch.id,
    });
    setOpenSectionDialog(true);
  }

  function openEditSection(section: Section, batch: Batch) {
    setEditingSection(section);
    setSectionTargetBatch(batch);
    setSectionForm({
      name: section.name,
      batch_id: section.batch_id,
    });
    setOpenSectionDialog(true);
  }

  function openMultiSectionGenerator(batch: Batch) {
    setMultiSectionBatch(batch);
    const existing = sectionsByBatch.get(batch.id) ?? [];
    if (existing.length === 0) {
      setMultiSectionInput("Section A, Section B, Section C");
    } else {
      const nextLetter = String.fromCharCode(65 + existing.length);
      const nextLetter2 = String.fromCharCode(65 + existing.length + 1);
      setMultiSectionInput(`Section ${nextLetter}, Section ${nextLetter2}`);
    }
    setOpenMultiSectionDialog(true);
  }

  function setBatchPreset(durationYears: number) {
    const startY = Number(batchForm.start_year) || currentYear;
    const endY = startY + durationYears;
    setBatchForm({
      ...batchForm,
      start_year: startY,
      end_year: endY,
      name: `${startY}-${endY}`,
    });
  }

  return (
    <AdminLayout
      title="Courses & Academic Structure"
      description="All-in-one management of Programmes, Admission Batches, and Class Sections"
    >
      <div className="space-y-6">
        {/* ========================================================================= */}
        {/* 1. EXECUTIVE SUMMARY STATS BAR                                            */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="panel p-3.5 rounded-xl border border-border bg-card flex items-center justify-between shadow-2xs">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Programmes
              </p>
              <p className="text-xl font-bold text-foreground font-mono mt-0.5">
                {totalCoursesCount}
              </p>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="size-4" />
            </span>
          </div>

          <div className="panel p-3.5 rounded-xl border border-border bg-card flex items-center justify-between shadow-2xs">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Batches
              </p>
              <p className="text-xl font-bold text-foreground font-mono mt-0.5">
                {totalBatchesCount}
              </p>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <Layers className="size-4" />
            </span>
          </div>

          <div className="panel p-3.5 rounded-xl border border-border bg-card flex items-center justify-between shadow-2xs">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Class Sections
              </p>
              <p className="text-xl font-bold text-foreground font-mono mt-0.5">
                {totalSectionsCount}
              </p>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-400">
              <GraduationCap className="size-4" />
            </span>
          </div>

          <div className="panel p-3.5 rounded-xl border border-border bg-card flex items-center justify-between shadow-2xs">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Enrolled
              </p>
              <p className="text-xl font-bold text-foreground font-mono mt-0.5">
                {totalStudentsCount}
              </p>
            </div>
            <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <Users className="size-4" />
            </span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. COMMAND TOOLBAR & CONTROLS                                             */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search course, batch, or section..."
                className="pl-9 h-9 text-xs rounded-lg"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg bg-muted p-1 border border-border">
              <button
                type="button"
                onClick={() => setViewMode("tree")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewMode === "tree"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Unified All-in-One Hierarchy View"
              >
                <LayoutGrid className="size-3.5" />
                <span>Hierarchy Tree</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewMode === "table"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Classic Table View"
              >
                <List className="size-3.5" />
                <span>Classic Table</span>
              </button>
            </div>

            {viewMode === "tree" && (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleAllExpanded(true)}
                  className="h-8 text-xs font-medium px-2.5"
                  title="Expand all courses"
                >
                  <ChevronDown className="size-3.5 mr-1" /> Expand All
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleAllExpanded(false)}
                  className="h-8 text-xs font-medium px-2.5"
                  title="Collapse all courses"
                >
                  <ChevronUp className="size-3.5 mr-1" /> Collapse All
                </Button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWindow("/quick/workbook", "master-workbook", 760, 800)}
              className="gap-1.5 h-9 text-xs rounded-lg"
            >
              <Upload className="size-3.5" /> Master Workbook
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openAddBatch()}
              className="gap-1.5 h-9 text-xs rounded-lg border-primary/30 text-primary hover:bg-primary/10"
            >
              <Layers className="size-3.5" /> + Add Batch
            </Button>
            <Button
              size="sm"
              onClick={openCreateCourse}
              className="gap-1.5 h-9 text-xs font-semibold shadow-xs rounded-lg"
            >
              <Plus className="size-3.5" /> New Course
            </Button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. MAIN CONTENT: HIERARCHY TREE OR TABLE                                  */}
        {/* ========================================================================= */}
        {coursesLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="panel p-12 text-center rounded-xl border border-dashed border-border bg-card">
            <BookOpen className="mx-auto size-10 text-muted-foreground/40 mb-3" />
            <p className="text-base font-semibold text-foreground">No academic records found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {search
                ? `No course, batch, or section matches "${search}".`
                : "Add your first degree programme to begin enrolling batches and classes."}
            </p>
            <Button onClick={openCreateCourse} className="mt-4 rounded-lg gap-1.5 text-xs">
              <Plus className="size-3.5" /> Add First Course
            </Button>
          </div>
        ) : viewMode === "tree" ? (
          /* ===================================================================== */
          /* 🌳 UNIFIED HIERARCHY TREE VIEW (ALL-IN-ONE)                           */
          /* ===================================================================== */
          <div className="space-y-4">
            {filteredCourses.map((course) => {
              const courseBatches = batchesByCourse.get(course.id) ?? [];
              const courseStudentCount = studentCounts.byCourse.get(course.id) ?? 0;
              const expanded = isCourseExpanded(course.id);

              let totalCourseSections = 0;
              for (const b of courseBatches) {
                totalCourseSections += (sectionsByBatch.get(b.id) ?? []).length;
              }

              return (
                <div
                  key={course.id}
                  className="rounded-2xl border border-border bg-card shadow-xs transition-all overflow-hidden"
                >
                  {/* Course Header Banner */}
                  <div
                    className={`p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                      expanded ? "bg-muted/30 border-b border-border/70" : "bg-card hover:bg-muted/30"
                    }`}
                    onClick={() => toggleCourseExpand(course.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        type="button"
                        className="size-7 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 shadow-2xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCourseExpand(course.id);
                        }}
                      >
                        {expanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>

                      <Badge
                        variant="outline"
                        className="font-mono font-bold text-xs bg-primary/10 text-primary border-primary/30 px-2.5 py-1 rounded-md shrink-0"
                      >
                        {course.code}
                      </Badge>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-sm sm:text-base text-foreground truncate">
                            {course.name}
                          </h3>
                        </div>
                      </div>
                    </div>

                    {/* Stats & Actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[11px] font-medium py-0.5">
                          {courseBatches.length} {courseBatches.length === 1 ? "Batch" : "Batches"}
                        </Badge>
                        <Badge variant="outline" className="text-[11px] font-medium py-0.5">
                          {totalCourseSections} Sections
                        </Badge>
                        <Badge variant="secondary" className="text-[11px] font-semibold py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                          {courseStudentCount} Students
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1 border-l border-border/80 pl-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddBatch(course);
                          }}
                          className="h-8 text-xs font-semibold gap-1 rounded-lg border-primary/30 text-primary hover:bg-primary/10"
                          title="Add Batch to this course"
                        >
                          <Plus className="size-3" /> Batch
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditCourse(course);
                          }}
                          className="size-8 text-muted-foreground hover:text-foreground rounded-lg"
                          title="Edit course"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({
                              type: "course",
                              id: course.id,
                              label: `Course ${course.code} (${course.name})`,
                            });
                          }}
                          className="size-8 text-muted-foreground hover:text-destructive rounded-lg"
                          title="Delete course"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Body: Batches & Sections */}
                  {expanded && (
                    <div className="p-4 sm:p-5 bg-card space-y-4">
                      {courseBatches.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/80 p-6 text-center bg-muted/10 space-y-2">
                          <p className="text-xs text-muted-foreground">
                            No admission batches created for this degree programme yet.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAddBatch(course)}
                            className="text-xs gap-1.5 h-8 rounded-lg"
                          >
                            <Plus className="size-3" /> Add First Batch (e.g. 2024-2028)
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3.5">
                          {courseBatches.map((batch) => {
                            const batchSections = sectionsByBatch.get(batch.id) ?? [];
                            const batchStudents = studentCounts.byBatch.get(batch.id) ?? 0;
                            const durationYrs = batch.end_year - batch.start_year;

                            return (
                              <div
                                key={batch.id}
                                className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3 shadow-2xs hover:border-primary/30 transition-colors"
                              >
                                {/* Batch Header Row */}
                                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-border/60">
                                  <div className="flex items-center gap-2.5">
                                    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                                      <Layers className="size-3.5" />
                                    </span>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm text-foreground">
                                          Batch {batch.name}
                                        </span>
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] font-mono py-0 text-muted-foreground"
                                        >
                                          {batch.start_year} — {batch.end_year} ({durationYrs} Yrs)
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Batch Right Actions */}
                                  <div className="flex items-center gap-1.5">
                                    <Badge
                                      variant="secondary"
                                      className="text-xs font-semibold py-0.5 bg-background border"
                                    >
                                      {batchStudents} Students
                                    </Badge>

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openAddSection(batch)}
                                      className="h-7 text-[11px] font-medium gap-1 px-2 rounded-md bg-card"
                                      title="Add Section to this batch"
                                    >
                                      <Plus className="size-3 text-primary" /> Add Section
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => openMultiSectionGenerator(batch)}
                                      className="h-7 text-[11px] font-medium gap-1 px-2 rounded-md text-primary hover:bg-primary/10"
                                      title="1-Click Auto Generate Sections"
                                    >
                                      <Sparkles className="size-3" /> Presets
                                    </Button>

                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => openEditBatch(batch, course)}
                                      className="size-7 text-muted-foreground hover:text-foreground rounded-md"
                                      title="Edit batch"
                                    >
                                      <Pencil className="size-3" />
                                    </Button>

                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() =>
                                        setDeleteTarget({
                                          type: "batch",
                                          id: batch.id,
                                          label: `Batch ${batch.name} (${course.code})`,
                                        })
                                      }
                                      className="size-7 text-muted-foreground hover:text-destructive rounded-md"
                                      title="Delete batch"
                                    >
                                      <Trash2 className="size-3" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Class Sections Row inside Batch */}
                                <div>
                                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mr-1">
                                      <GraduationCap className="size-3.5" /> Class Sections ({batchSections.length}):
                                    </span>

                                    {batchSections.length === 0 ? (
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                                        <span>No class sections defined yet.</span>
                                        <button
                                          type="button"
                                          onClick={() => openAddSection(batch)}
                                          className="text-primary hover:underline font-semibold cursor-pointer text-xs"
                                        >
                                          + Quick Create Section A
                                        </button>
                                      </div>
                                    ) : (
                                      batchSections.map((sec) => {
                                        const secStudents = studentCounts.bySection.get(sec.id) ?? 0;
                                        return (
                                          <div
                                            key={sec.id}
                                            className="group/sec inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground shadow-2xs hover:border-primary/40 transition-all"
                                          >
                                            <span className="font-semibold">{sec.name}</span>
                                            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                                              {secStudents} stud.
                                            </span>

                                            <div className="hidden group-hover/sec:flex items-center gap-0.5 ml-1 border-l border-border pl-1">
                                              <button
                                                type="button"
                                                onClick={() => openEditSection(sec, batch)}
                                                className="p-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                                title="Edit Section Name"
                                              >
                                                <Pencil className="size-2.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setDeleteTarget({
                                                    type: "section",
                                                    id: sec.id,
                                                    label: `Section "${sec.name}" in Batch ${batch.name}`,
                                                  })
                                                }
                                                className="p-0.5 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                                                title="Delete Section"
                                              >
                                                <Trash2 className="size-2.5" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}

                                    {/* Inline Add Section Button */}
                                    <button
                                      type="button"
                                      onClick={() => openAddSection(batch)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-primary hover:border-primary hover:bg-card transition-all cursor-pointer font-medium"
                                      title="Add another section"
                                    >
                                      <Plus className="size-3" /> Section
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ===================================================================== */
          /* 📋 CLASSIC TABLE VIEW                                                 */
          /* ===================================================================== */
          <div className="panel border border-border rounded-xl bg-card shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  <tr>
                    <th className="px-5 py-3.5 w-28">Code</th>
                    <th className="px-5 py-3.5 w-72">Programme Name</th>
                    <th className="px-5 py-3.5">Batches & Sections Enrolled</th>
                    <th className="px-5 py-3.5 text-center w-28">Students</th>
                    <th className="px-5 py-3.5 text-right w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pagedCourses.map((course) => {
                    const courseBatches = batchesByCourse.get(course.id) ?? [];
                    const studCount = studentCounts.byCourse.get(course.id) ?? 0;
                    return (
                      <tr key={course.id} className="transition-colors hover:bg-muted/30 group">
                        <td className="px-5 py-4 align-top">
                          <Badge
                            variant="outline"
                            className="font-mono font-bold text-xs bg-primary/10 text-primary border-primary/30 px-2.5 py-1 rounded-md"
                          >
                            {course.code}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <p className="font-semibold text-foreground text-sm">{course.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {courseBatches.length} batch(es) configured
                          </p>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {courseBatches.map((b) => {
                              const bSecs = sectionsByBatch.get(b.id) ?? [];
                              return (
                                <span
                                  key={b.id}
                                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-secondary/80 text-foreground border border-border shadow-2xs"
                                  title={`${bSecs.length} sections`}
                                >
                                  <Layers className="size-3 text-primary" />
                                  <span>{b.name}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    ({bSecs.length} sec)
                                  </span>
                                </span>
                              );
                            })}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-full px-2.5 text-xs font-medium gap-1 border-dashed border-primary/40 text-primary"
                              onClick={() => openAddBatch(course)}
                            >
                              <Plus className="size-3" /> Add batch
                            </Button>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center align-top font-mono font-bold text-primary">
                          {studCount}
                        </td>
                        <td className="px-5 py-4 text-right align-top">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                              onClick={() => openEditCourse(course)}
                              title="Edit course"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  type: "course",
                                  id: course.id,
                                  label: `Course ${course.code}`,
                                })
                              }
                              title="Delete course"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <DataPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filteredCourses.length}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* DIALOG 1: CREATE / EDIT COURSE                                            */}
      {/* ========================================================================= */}
      <Dialog open={openCourseDialog} onOpenChange={setOpenCourseDialog}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BookOpen className="size-4" />
              </span>
              <DialogTitle className="text-lg font-bold">
                {editingCourse ? "Edit Course Programme" : "New Degree Programme"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {editingCourse
                ? "Update programme title and short identification code."
                : "Create a new degree course and optionally setup its first batch cohort."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="course-name" className="text-xs font-semibold">
                Programme Full Name
              </Label>
              <Input
                id="course-name"
                value={courseForm.name}
                maxLength={120}
                onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })}
                placeholder="e.g. Bachelor of Technology in Computer Science"
                className="rounded-xl h-9 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="course-code" className="text-xs font-semibold">
                Course Code / Acronym (Unique Identifier)
              </Label>
              <Input
                id="course-code"
                value={courseForm.code}
                maxLength={20}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, code: e.target.value.toUpperCase() })
                }
                placeholder="e.g. BTECHCSE or MBA"
                className="rounded-xl font-mono uppercase h-9 text-xs"
                required
              />
            </div>

            {/* Optional initial batch creation */}
            {!editingCourse && (
              <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="with-batch"
                    checked={withInitialBatch}
                    onCheckedChange={(checked) => setWithInitialBatch(Boolean(checked))}
                  />
                  <Label
                    htmlFor="with-batch"
                    className="text-xs font-semibold cursor-pointer text-foreground flex items-center gap-1.5"
                  >
                    <Layers className="size-3.5 text-primary" /> Also enroll starting batch cohort right now
                  </Label>
                </div>

                {withInitialBatch && (
                  <div className="space-y-2.5 pt-1 border-t border-border/60">
                    <div>
                      <Label htmlFor="init-batch-name" className="text-[11px] text-muted-foreground font-medium">
                        Batch Name
                      </Label>
                      <Input
                        id="init-batch-name"
                        value={initialBatchForm.name}
                        onChange={(e) =>
                          setInitialBatchForm({ ...initialBatchForm, name: e.target.value })
                        }
                        placeholder="2025-2029"
                        className="rounded-lg h-8 text-xs mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="init-start-yr" className="text-[11px] text-muted-foreground font-medium">
                          Start Year
                        </Label>
                        <Input
                          id="init-start-yr"
                          type="number"
                          value={initialBatchForm.start_year}
                          onChange={(e) => {
                            const startY = Number(e.target.value);
                            setInitialBatchForm({
                              ...initialBatchForm,
                              start_year: startY,
                              name: `${startY}-${initialBatchForm.end_year}`,
                            });
                          }}
                          className="rounded-lg h-8 text-xs mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="init-end-yr" className="text-[11px] text-muted-foreground font-medium">
                          End Year
                        </Label>
                        <Input
                          id="init-end-yr"
                          type="number"
                          value={initialBatchForm.end_year}
                          onChange={(e) => {
                            const endY = Number(e.target.value);
                            setInitialBatchForm({
                              ...initialBatchForm,
                              end_year: endY,
                              name: `${initialBatchForm.start_year}-${endY}`,
                            });
                          }}
                          className="rounded-lg h-8 text-xs mt-1"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <Checkbox
                        id="with-sections"
                        checked={initialBatchForm.withSections}
                        onCheckedChange={(checked) =>
                          setInitialBatchForm({
                            ...initialBatchForm,
                            withSections: Boolean(checked),
                          })
                        }
                      />
                      <Label htmlFor="with-sections" className="text-xs cursor-pointer text-muted-foreground">
                        Automatically create Section A and Section B
                      </Label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenCourseDialog(false)}
              className="rounded-lg h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => saveCourseMut.mutate()}
              disabled={saveCourseMut.isPending}
              className="rounded-lg h-9 text-xs font-semibold"
            >
              {saveCourseMut.isPending ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              {editingCourse ? "Save Changes" : "Create Programme"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* DIALOG 2: CREATE / EDIT BATCH                                             */}
      {/* ========================================================================= */}
      <Dialog open={openBatchDialog} onOpenChange={setOpenBatchDialog}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                <Layers className="size-4" />
              </span>
              <DialogTitle className="text-lg font-bold">
                {editingBatch ? "Edit Admission Batch" : "Add Batch Cohort"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {batchTargetCourse ? (
                <>
                  Attaching batch cohort to{" "}
                  <strong className="text-foreground">
                    {batchTargetCourse.name} ({batchTargetCourse.code})
                  </strong>
                  .
                </>
              ) : (
                "Attach an admission batch group to an academic degree programme."
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Quick Duration Presets */}
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" /> Quick Duration Presets:
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "4-Yr (B.Tech)", yrs: 4 },
                { label: "2-Yr (MBA)", yrs: 2 },
                { label: "3-Yr (BCA/BBA)", yrs: 3 },
                { label: "5-Yr (Integ.)", yrs: 5 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setBatchPreset(p.yrs)}
                  className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:bg-primary/10 transition-all text-center cursor-pointer shadow-2xs"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3.5 pt-1">
            {/* If not opened from a specific course, allow picking course */}
            {!batchTargetCourse && (
              <div className="space-y-1.5">
                <Label htmlFor="batch-course-select" className="text-xs font-semibold">
                  Select Degree Programme
                </Label>
                <Select
                  value={batchForm.course_id}
                  onValueChange={(val) => setBatchForm({ ...batchForm, course_id: val })}
                >
                  <SelectTrigger className="w-full h-9 text-xs rounded-xl">
                    <SelectValue placeholder="Select course..." />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="batch-name" className="text-xs font-semibold">
                Batch Name
              </Label>
              <Input
                id="batch-name"
                value={batchForm.name}
                maxLength={60}
                onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
                placeholder="e.g. 2025-2029"
                className="rounded-xl h-9 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start-year" className="text-xs font-semibold">
                  Start Year (Admission)
                </Label>
                <Input
                  id="start-year"
                  type="number"
                  value={batchForm.start_year}
                  min={1950}
                  max={2100}
                  onChange={(e) => {
                    const startY = Number(e.target.value);
                    const diff = Number(batchForm.end_year) - Number(batchForm.start_year) || 4;
                    setBatchForm({
                      ...batchForm,
                      start_year: startY,
                      end_year: startY + diff,
                      name: `${startY}-${startY + diff}`,
                    });
                  }}
                  className="rounded-xl h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="end-year" className="text-xs font-semibold">
                  End Year (Graduation)
                </Label>
                <Input
                  id="end-year"
                  type="number"
                  value={batchForm.end_year}
                  min={1950}
                  max={2100}
                  onChange={(e) => {
                    const endY = Number(e.target.value);
                    setBatchForm({
                      ...batchForm,
                      end_year: endY,
                      name: `${batchForm.start_year}-${endY}`,
                    });
                  }}
                  className="rounded-xl h-9 text-xs"
                  required
                />
              </div>
            </div>

            {!editingBatch && (
              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="batch-sections"
                  checked={batchForm.withSections}
                  onCheckedChange={(checked) =>
                    setBatchForm({ ...batchForm, withSections: Boolean(checked) })
                  }
                />
                <Label htmlFor="batch-sections" className="text-xs cursor-pointer text-foreground">
                  Automatically create Section A and Section B inside this batch
                </Label>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenBatchDialog(false)}
              className="rounded-lg h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => saveBatchMut.mutate()}
              disabled={saveBatchMut.isPending}
              className="rounded-lg h-9 text-xs font-semibold"
            >
              {saveBatchMut.isPending ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              {editingBatch ? "Save Changes" : "Save Batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* DIALOG 3: CREATE / EDIT CLASS SECTION                                     */}
      {/* ========================================================================= */}
      <Dialog open={openSectionDialog} onOpenChange={setOpenSectionDialog}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex size-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-400">
                <GraduationCap className="size-4" />
              </span>
              <DialogTitle className="text-lg font-bold">
                {editingSection ? "Edit Class Section" : "Add Class Section"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {sectionTargetBatch ? (
                <>
                  Creating section in{" "}
                  <strong className="text-foreground">Batch {sectionTargetBatch.name}</strong>.
                </>
              ) : (
                "Add a class section to group students for lectures and exams."
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Quick Letter Presets */}
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" /> Quick Section Names:
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {["Section A", "Section B", "Section C", "Section D"].map((lbl) => (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => setSectionForm({ ...sectionForm, name: lbl })}
                  className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:bg-primary/10 transition-all text-center cursor-pointer shadow-2xs"
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3.5 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="section-name" className="text-xs font-semibold">
                Section Name
              </Label>
              <Input
                id="section-name"
                value={sectionForm.name}
                maxLength={60}
                onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
                placeholder="e.g. Section A, Section CSE 1"
                className="rounded-xl h-9 text-xs"
                required
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenSectionDialog(false)}
              className="rounded-lg h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => saveSectionMut.mutate()}
              disabled={saveSectionMut.isPending}
              className="rounded-lg h-9 text-xs font-semibold"
            >
              {saveSectionMut.isPending ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              {editingSection ? "Save Changes" : "Create Section"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* DIALOG 4: MULTI-SECTION 1-CLICK GENERATOR                                 */}
      {/* ========================================================================= */}
      <Dialog open={openMultiSectionDialog} onOpenChange={setOpenMultiSectionDialog}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </span>
              <DialogTitle className="text-lg font-bold">1-Click Generate Sections</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Quickly create multiple sections at once for{" "}
              <strong className="text-foreground">Batch {multiSectionBatch?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="multi-sections" className="text-xs font-semibold">
                Section Names (comma-separated):
              </Label>
              <Input
                id="multi-sections"
                value={multiSectionInput}
                onChange={(e) => setMultiSectionInput(e.target.value)}
                placeholder="Section A, Section B, Section C, Section D"
                className="rounded-xl h-9 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Tip: Enter multiple names separated by comma. E.g. <code>Section A, Section B, Section C</code>
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                "Section A, Section B",
                "Section A, Section B, Section C",
                "Section A, Section B, Section C, Section D",
                "Section I, Section II, Section III",
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMultiSectionInput(preset)}
                  className="rounded-md border border-border bg-secondary/50 px-2 py-1 text-[11px] text-foreground hover:bg-primary/10 hover:border-primary transition-colors cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenMultiSectionDialog(false)}
              className="rounded-lg h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => generateMultiSectionsMut.mutate()}
              disabled={generateMultiSectionsMut.isPending}
              className="rounded-lg h-9 text-xs font-semibold"
            >
              {generateMultiSectionsMut.isPending ? (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : null}
              Generate All Sections
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* DIALOG 5: DELETE CONFIRMATION                                             */}
      {/* ========================================================================= */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1 text-destructive">
              <span className="flex size-8 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Trash2 className="size-4" />
              </span>
              <DialogTitle className="text-lg font-bold">Confirm Deletion</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to permanently delete{" "}
              <strong className="text-foreground">{deleteTarget?.label}</strong>?
            </DialogDescription>
          </DialogHeader>

          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 p-3 rounded-xl border border-amber-500/30">
            ⚠ Warning: If any students, sections, or examination groups are linked to this record, deletion will be blocked by database integrity rules.
          </p>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg h-9 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
              className="rounded-lg h-9 text-xs font-semibold"
            >
              {deleteMut.isPending ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}