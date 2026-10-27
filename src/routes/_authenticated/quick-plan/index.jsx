import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import {
  Sparkles,
  CheckCircle2,
  Printer,
  Download,
  ArrowLeft,
  AlertTriangle,
  Users,
  Check,
  Loader2,
  Building2,
  BookOpen,
  X,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UNIVERSITY_NAME } from "@/lib/db";
import {
  listActiveRooms,
  listAvailableSubjectsAndClasses,
  fetchStudentsForSelectedItems,
  generateSeatingPlanPreview,
  commitConfirmedPlan,
} from "@/lib/quick-seating";
import { validateMergePair } from "@/lib/seating-algorithm.js";
import { exportSeatingWorkbook } from "@/lib/seating-export";

export const Route = createFileRoute("/_authenticated/quick-plan/")({
  head: () => ({
    meta: [
      { title: "Automated Seating Plan | Examination Branch" },
      {
        name: "description",
        content:
          "Automatic seating plan generator: Single or Doubles pattern, auto hall assignment, and live printable PDF preview.",
      },
    ],
  }),
  component: SimpleQuickPlanPage,
});

function SimpleQuickPlanPage() {
  const navigate = useNavigate();

  // -------------------------------------------------------------------------
  // 1. Core State: Only 2 options — "single" or "doubles"
  // -------------------------------------------------------------------------
  const [pattern, setPattern] = useState("doubles"); // "single" | "doubles"

  // For Doubles: Exactly 2 Classes (Class A and Class B)
  const [classA, setClassA] = useState(null);
  const [classB, setClassB] = useState(null);

  // For Single: 1 or more classes
  const [singleItems, setSingleItems] = useState([]);

  // Exam Date & Session
  const [examDate, setExamDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [session, setSession] = useState("morning");

  // Review State (generated in-memory, review before confirm)
  const [previewData, setPreviewData] = useState(null);
  const [reviewTab, setReviewTab] = useState("pdf"); // "pdf" | "grids"
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(null);

  // -------------------------------------------------------------------------
  // 2. Data Queries
  // -------------------------------------------------------------------------
  const { data: availableItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["available_subjects_and_classes"],
    queryFn: listAvailableSubjectsAndClasses,
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ["active_rooms"],
    queryFn: listActiveRooms,
  });

  // Pre-select Class A and Class B with valid defaults once availableItems is loaded
  useEffect(() => {
    if (availableItems.length >= 2) {
      if (!classA) setClassA(availableItems[0]);
      if (!classB) setClassB(availableItems[1]);
    }
  }, [availableItems, classA, classB]);

  // Currently selected items
  const currentSelectedItems = useMemo(() => {
    if (pattern === "doubles") {
      return [classA, classB].filter(Boolean);
    }
    return singleItems;
  }, [pattern, classA, classB, singleItems]);

  // Fetch enrolled students for selected items
  const { data: loadedGroups = [] } = useQuery({
    queryKey: ["enrolled_for_selected", currentSelectedItems.map((i) => i.id).join(",")],
    queryFn: () => fetchStudentsForSelectedItems(currentSelectedItems),
    enabled: currentSelectedItems.length > 0,
  });

  // Total student count
  const totalStudents = useMemo(() => {
    return loadedGroups.reduce((sum, g) => sum + (g.students?.length || 0), 0);
  }, [loadedGroups]);

  // -------------------------------------------------------------------------
  // 3. Strict Doubles Merge Validation: Same Year Merge Strictly Blocked!
  // -------------------------------------------------------------------------
  const doublesValidation = useMemo(() => {
    if (pattern !== "doubles") return { valid: true, error: null };
    if (!classA || !classB) {
      return {
        valid: false,
        error: "Please select both Class A and Class B to merge.",
        isPartial: true,
      };
    }

    const res = validateMergePair(classA, classB);
    if (!res.valid) {
      return {
        valid: false,
        error: `Same Year Conflict: ${res.reason}`,
        isPartial: false,
      };
    }

    return { valid: true, error: null };
  }, [pattern, classA, classB]);

  // -------------------------------------------------------------------------
  // 4. Generate In-Memory Preview (Zero Room Picking!)
  // -------------------------------------------------------------------------
  const handleGeneratePreview = async () => {
    if (currentSelectedItems.length === 0) {
      toast.error("Please select a subject or class first.");
      return;
    }

    if (pattern === "doubles" && !doublesValidation.valid) {
      toast.error(doublesValidation.error || "Please select valid different-year or different-course classes.");
      return;
    }

    setIsGenerating(true);
    try {
      // Re-fetch fresh enrolled students from Supabase
      const groups = await fetchStudentsForSelectedItems(currentSelectedItems);
      const studentTotal = groups.reduce((sum, g) => sum + (g.students?.length || 0), 0);

      if (studentTotal === 0) {
        toast.error("No active students found in database for the selected class.");
        setIsGenerating(false);
        return;
      }

      // Prepare streams for doubles
      let multiStreams = undefined;
      if (pattern === "doubles" && classA && classB) {
        const streamA = groups.filter(
          (g) => g.subject_id === classA.id || g.label.includes(classA.code || classA.name)
        );
        const streamB = groups.filter(
          (g) => g.subject_id === classB.id || g.label.includes(classB.code || classB.name)
        );
        multiStreams = [streamA, streamB];
      }

      // Automatically passes all active rooms; algorithm automatically sorts by capacity descending,
      // assigns biggest rooms to biggest strength, and overflows into next sections!
      const preview = generateSeatingPlanPreview({
        selectedItems: currentSelectedItems,
        groups,
        examDate,
        session,
        selectedRooms: rooms,
        mergeMode: pattern === "doubles",
        multiStreams,
        fillMode: "pack_rooms",
        universityName: UNIVERSITY_NAME,
      });

      setPreviewData(preview);
      setReviewTab("pdf");
      toast.success(
        `Generated plan for ${preview.result.seated} students across ${preview.result.rooms.length} hall(s)!`
      );
    } catch (err) {
      toast.error(err.message || "Failed to generate seating plan preview.");
    } finally {
      setIsGenerating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 5. Confirm & Save to Supabase
  // -------------------------------------------------------------------------
  const handleConfirmAndSave = async () => {
    if (!previewData) return;
    setIsSaving(true);
    try {
      const commitRes = await commitConfirmedPlan(previewData);
      setSavedSuccess(commitRes);
      toast.success(
        `Successfully saved plan for ${commitRes.seatedCount} students across ${commitRes.roomsCount} hall(s)!`
      );
    } catch (err) {
      toast.error(err.message || "Failed to save seating plan.");
    } finally {
      setIsSaving(false);
    }
  };

  // Print PDF directly
  const handlePrint = () => {
    if (!previewData?.printableHtml) return;

    // 1. Try printing directly via embedded iframe (fastest, no pop-up blocker issues)
    const iframe = document.getElementById("seating-print-iframe");
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        return;
      } catch (err) {
        console.warn("Direct iframe print fallback:", err);
      }
    }

    // 2. Fallback to pop-up window
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Pop-up was blocked. Please allow pop-ups for printing.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(previewData.printableHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  // Excel export
  const handleExcelExport = () => {
    if (!previewData) return;
    exportSeatingWorkbook(
      previewData.result.rooms,
      previewData.examInfo.examName,
      `${previewData.examInfo.examDate} · ${previewData.examInfo.session}`
    );
    toast.success("Excel sheet exported successfully!");
  };

  // -------------------------------------------------------------------------
  // RENDER: REVIEW & CONFIRMATION SCREEN
  // -------------------------------------------------------------------------
  if (previewData) {
    const { result, examInfo } = previewData;

    return (
      <AdminLayout
        title="Seating Plan Review"
        description={`${examInfo.examName} · ${examInfo.examDate} (${examInfo.session})`}
      >
        <div className="max-w-7xl mx-auto space-y-5">
          {/* Top Review Bar with Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card shadow-xs">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewData(null)}
              className="gap-1.5"
            >
              <ArrowLeft className="size-4" /> Change / Re-edit
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
              >
                <Printer className="size-4" /> Print / Save PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExcelExport}
                className="gap-1.5"
              >
                <Download className="size-4" /> Export Excel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmAndSave}
                disabled={isSaving || savedSuccess}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : savedSuccess ? (
                  <Check className="size-4" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {savedSuccess ? "Plan Saved ✓" : "Confirm & Save Plan"}
              </Button>
            </div>
          </div>

          {/* Saved Confirmation Alert */}
          {savedSuccess && (
            <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="size-5 text-emerald-600" />
                <div>
                  <p className="font-bold">Seating Plan Permanently Saved!</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Allocated {savedSuccess.seatedCount} students across {savedSuccess.roomsCount} examination halls.
                  </p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="border-emerald-400 text-emerald-800 bg-white">
                <Link to="/exams/seating" search={{ examId: savedSuccess.exam?.id }}>
                  Open in Hall Manager →
                </Link>
              </Button>
            </div>
          )}

          {/* Quick Summary Pill */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-border bg-muted/20 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-semibold text-foreground">
                <Users className="size-3.5 mr-1" />
                {result.seated} Students Seated
              </Badge>
              <Badge variant="outline" className="border-primary/40 text-primary">
                <Building2 className="size-3.5 mr-1" />
                {result.rooms.length} Halls Allocated (Biggest hall first)
              </Badge>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                {result.totalVacant} Vacant Seats Left
              </Badge>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                Pattern: {pattern === "doubles" ? "Doubles (Alternate A ⇄ B)" : "Single Class"}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReviewTab("pdf")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  reviewTab === "pdf"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                📄 PDF Printable Sheet Preview
              </button>
              <button
                type="button"
                onClick={() => setReviewTab("grids")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  reviewTab === "grids"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                🏢 Visual Room Grids
              </button>
            </div>
          </div>

          {/* TAB 1: OFFICIAL PDF PREVIEW FRAME */}
          {reviewTab === "pdf" && (
            <div className="panel overflow-hidden p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
                <div className="flex items-center gap-2">
                  <Printer className="size-4 text-primary" />
                  <span className="font-bold text-sm text-foreground">
                    Official Examination Seating Sheet (Live PDF Preview)
                  </span>
                  <Badge variant="outline" className="text-[11px] font-semibold border-primary/30 text-primary bg-primary/5">
                    A4 Landscape Formatted
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    💡 Click below to open print dialog (Paper: A4 · Orientation: Landscape)
                  </span>
                  <Button size="sm" onClick={handlePrint} className="gap-1.5 h-8 text-xs font-semibold">
                    <Printer className="size-3.5" /> Print / Save as PDF
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/10 shadow-inner overflow-hidden">
                <iframe
                  id="seating-print-iframe"
                  title="Seating Plan PDF Preview"
                  srcDoc={previewData.printableHtml}
                  className="w-full h-[880px] border-0"
                />
              </div>
            </div>
          )}

          {/* TAB 2: VISUAL ROOM DESK GRIDS */}
          {reviewTab === "grids" && (
            <div className="space-y-4">
              {result.rooms.map((pr) => (
                <div key={pr.room.id} className="panel p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2 text-xs">
                    <span className="font-bold text-foreground text-sm">
                      {pr.room.block} — Room {pr.room.room_number}
                    </span>
                    <span className="text-muted-foreground">
                      {pr.used} seated · {pr.vacant} vacant
                    </span>
                  </div>
                  <div className="overflow-x-auto pb-2">
                    <table className="border-collapse text-xs w-full">
                      <tbody>
                        {Array.from({ length: pr.room.row_count }).map((_, rIdx) => (
                          <tr key={rIdx}>
                            <td className="p-1 font-bold text-muted-foreground text-[10px] w-6">R{rIdx + 1}</td>
                            {Array.from({ length: pr.room.seats_per_row }).map((_, cIdx) => {
                              const seat = pr.seats.find(
                                (s) => s.row_number === rIdx + 1 && s.seat_number === cIdx + 1
                              );
                              return (
                                <td key={cIdx} className="p-1 min-w-[90px]">
                                  {seat ? (
                                    <div className="rounded border border-border bg-card p-1.5 text-[10px]">
                                      <p className="font-bold text-foreground truncate">
                                        {(seat.student || seat.students)?.name || "Student"}
                                      </p>
                                      <p className="font-mono text-muted-foreground">
                                        {(seat.student || seat.students)?.roll_number || (seat.student || seat.students)?.registration_number || "—"}
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="rounded border border-dashed border-border bg-muted/10 p-2 text-center text-[10px] text-muted-foreground/60">
                                      Vacant
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AdminLayout>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: CLEAN, MINIMAL 1-SCREEN CONFIGURATION (SINGLE OR DOUBLES ONLY)
  // -------------------------------------------------------------------------
  return (
    <AdminLayout
      title="Automated Seating Plan"
      description="Choose Single or Doubles seating, select classes, and preview your examination seating sheet."
    >
      <div className="max-w-xl mx-auto space-y-5">

        {/* 1. SEATING PATTERN: ONLY 2 OPTIONS (SINGLE OR DOUBLES) */}
        <section className="panel p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-primary">
                Seating Arrangement Pattern
              </Label>
              <h2 className="text-base font-bold text-foreground">
                Single or Doubles?
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pattern === "doubles"
                  ? "Doubles: Two different classes alternate seats (A ⇄ B) across columns to prevent examination misconduct."
                  : "Single: Sequential column-wise seating for a single class or examination paper."}
              </p>
            </div>

            {/* Exactly 2 Buttons: Single or Doubles */}
            <div className="inline-flex rounded-xl bg-muted p-1 border border-border shrink-0">
              <button
                type="button"
                onClick={() => setPattern("single")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  pattern === "single"
                    ? "bg-card text-foreground shadow-xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>📋 Single</span>
              </button>
              <button
                type="button"
                onClick={() => setPattern("doubles")}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  pattern === "doubles"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="size-3.5" />
                <span>⚡ Doubles (Merge 2)</span>
              </button>
            </div>
          </div>
        </section>

        {/* 2. CLASS SELECTION */}
        <section className="panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div>
              <h2 className="text-sm font-bold text-foreground">
                {pattern === "doubles" ? "Select 2 Classes to Merge (Doubles)" : "Select Class (Single)"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Students and admission years are automatically resolved.
              </p>
            </div>

            <Badge variant="secondary" className="font-semibold text-xs">
              <Users className="size-3 mr-1" />
              {totalStudents} Enrolled
            </Badge>
          </div>

          {/* IF DOUBLES: EXACTLY 2 SLOTS (CLASS A & CLASS B) */}
          {pattern === "doubles" ? (
            <div className="space-y-3.5">
              {/* Slot 1: Class A */}
              <div className="space-y-1.5 p-3 rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                      A
                    </span>
                    Class A (First Group):
                  </Label>
                  {classA && (
                    <span className="text-[11px] text-primary font-semibold">
                      {classA.course_code} {classA.start_year ? `(${classA.start_year})` : ""}
                    </span>
                  )}
                </div>

                <Select
                  value={classA?.id || ""}
                  onValueChange={(id) => {
                    const item = availableItems.find((i) => i.id === id) || null;
                    setClassA(item);
                    if (previewData) setPreviewData(null);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs bg-card">
                    <SelectValue placeholder="Select Class A (e.g. B.Tech 2023, MBA 2024)" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.display_title || item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Slot 2: Class B */}
              <div className="space-y-1.5 p-3 rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                      B
                    </span>
                    Class B (Second Group to alternate):
                  </Label>
                  {classB && (
                    <span className="text-[11px] text-primary font-semibold">
                      {classB.course_code} {classB.start_year ? `(${classB.start_year})` : ""}
                    </span>
                  )}
                </div>

                <Select
                  value={classB?.id || ""}
                  onValueChange={(id) => {
                    const item = availableItems.find((i) => i.id === id) || null;
                    setClassB(item);
                    if (previewData) setPreviewData(null);
                  }}
                >
                  <SelectTrigger className="h-9 text-xs bg-card">
                    <SelectValue placeholder="Select Class B (different year or different course)" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.display_title || item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Validation Warning for Same Year Collision */}
              {!doublesValidation.valid && !doublesValidation.isPartial && (
                <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Same Admission Year Merge Blocked!</p>
                    <p className="text-[11px] mt-0.5 leading-relaxed">
                      {doublesValidation.error}
                    </p>
                    <p className="text-[10px] opacity-80 mt-1">
                      Rule: Batches of the same course and same admission year cannot be merged together. Please select different admission years (e.g. 2023 with 2024) or different courses (e.g. B.Tech with MBA).
                    </p>
                  </div>
                </div>
              )}

              {doublesValidation.valid && classA && classB && (
                <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  <span>
                    Valid Doubles Merge! Students from Class A and Class B will alternate seats down each column.
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* IF SINGLE: SELECT CLASS */
            <div className="space-y-3">
              <Select
                value=""
                onValueChange={(id) => {
                  const item = availableItems.find((i) => i.id === id);
                  if (item && !singleItems.some((s) => s.id === item.id)) {
                    setSingleItems((prev) => [...prev, item]);
                  }
                }}
              >
                <SelectTrigger className="h-9 text-xs bg-card">
                  <SelectValue placeholder="▾ Click to select class or subject paper" />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem
                      key={item.id}
                      value={item.id}
                      disabled={singleItems.some((s) => s.id === item.id)}
                    >
                      {item.display_title || item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Selected Chips */}
              {singleItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {singleItems.map((item) => (
                    <span
                      key={item.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1 text-xs font-semibold text-primary"
                    >
                      <BookOpen className="size-3" />
                      <span>{item.name}</span>
                      <button
                        type="button"
                        onClick={() => setSingleItems((prev) => prev.filter((i) => i.id !== item.id))}
                        className="size-3.5 rounded-full hover:bg-primary/20 flex items-center justify-center"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 3. EXAM DATE & SESSION */}
        <section className="panel p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Examination Date</Label>
              <Input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">Sitting Session</Label>
              <Select value={session} onValueChange={setSession}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning (09:30 AM – 12:30 PM)</SelectItem>
                  <SelectItem value="afternoon">Afternoon (02:00 PM – 05:00 PM)</SelectItem>
                  <SelectItem value="evening">Evening (05:30 PM – 08:30 PM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* 4. SILENT AUTOMATION BADGE (NO ROOM CLUTTER) */}
        <div className="p-3 rounded-xl border border-border bg-muted/20 text-xs text-muted-foreground flex items-center gap-2">
          <Building2 className="size-4 text-primary shrink-0" />
          <span>
            <strong>Automatic Hall Allocation:</strong> Largest examination halls are assigned first based on class strength; leftover seats in a hall automatically accommodate the next section.
          </span>
        </div>

        {/* 5. GENERATE BUTTON */}
        <Button
          onClick={handleGeneratePreview}
          disabled={isGenerating || (pattern === "doubles" && !doublesValidation.valid)}
          className="w-full h-11 text-sm font-bold gap-2 bg-primary text-primary-foreground shadow-sm hover:opacity-95"
        >
          {isGenerating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Generate Seating Plan (Review PDF)
        </Button>
      </div>
    </AdminLayout>
  );
}
