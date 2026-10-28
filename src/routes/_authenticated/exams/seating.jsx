import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Download, FileSpreadsheet, Loader2, Plus,
  Printer, Trash2, Wand2, Mail, Users, ArrowRightLeft,
  Sparkles, Search, Building2, CheckCircle2,
  BookOpen, RotateCcw, SlidersHorizontal, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UNIVERSITY_NAME } from "@/lib/db";
import {
  createRoom, getSeatingPlanForDate,
  listRooms, loadGroupsForDateAndSession, previewSeatingForDate,
  saveSeatingPlanForDate,
  listExamsDetailed,
} from "@/lib/seating";
import { buildRoomGrid } from "@/lib/seating-algorithm.js";
import { buildMultiSubjectPrintHtml } from "@/lib/quick-seating";
import { exportSeatingWorkbook } from "@/lib/seating-export";
import { autoAssignProfessors, listDuties, removeDuty } from "@/lib/professors";
import { sendBulkDutySummary } from "@/lib/email";
import { RoomImportDialog } from "@/components/rooms/RoomImportDialog";

export const Route = createFileRoute("/_authenticated/exams/seating")({
  validateSearch: (search) => ({
    examId: typeof search?.examId === "string" ? search.examId : "",
    date: typeof search?.date === "string" ? search.date : "",
    session: typeof search?.session === "string" ? search.session : "",
  }),
  head: () => ({
    meta: [{ title: "Seating Arrangement Plan | Exam Branch" }],
  }),
  component: SeatingPage,
});

const BATCH_COLOR_PALETTES = [
  {
    bg: "bg-emerald-500/10 dark:bg-emerald-950/30",
    border: "border-emerald-300 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-300",
    badge: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200",
  },
  {
    bg: "bg-sky-500/10 dark:bg-sky-950/30",
    border: "border-sky-300 dark:border-sky-800",
    text: "text-sky-700 dark:text-sky-300",
    badge: "bg-sky-500/20 text-sky-800 dark:text-sky-200",
  },
  {
    bg: "bg-purple-500/10 dark:bg-purple-950/30",
    border: "border-purple-300 dark:border-purple-800",
    text: "text-purple-700 dark:text-purple-300",
    badge: "bg-purple-500/20 text-purple-800 dark:text-purple-200",
  },
  {
    bg: "bg-amber-500/10 dark:bg-amber-950/30",
    border: "border-amber-300 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-300",
    badge: "bg-amber-500/20 text-amber-800 dark:text-amber-200",
  },
];

const PROF_PER_ROOM_OPTIONS = [
  { value: "1", label: "1 Invigilator per Hall" },
  { value: "2", label: "2 Invigilators per Hall" },
  { value: "3", label: "3 Invigilators per Hall" },
];

function SeatingPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Top View Navigation: "plan" | "rooms" | "duties"
  const [activeTab, setActiveTab] = useState("plan");
  // In Plan view: "all" or specific room_id
  const [selectedRoomId, setSelectedRoomId] = useState("all");

  // Dialog for room selection from left column
  const [hallModalOpen, setHallModalOpen] = useState(false);

  const { data: detailedExams = [] } = useQuery({
    queryKey: ["exams_detailed"],
    queryFn: listExamsDetailed,
  });

  // Unique scheduled sessions
  const scheduledSessions = useMemo(() => {
    const map = new Map();
    for (const e of detailedExams) {
      const sess = (e.session || "morning").toLowerCase();
      const key = `${e.exam_date}_${sess}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          date: e.exam_date,
          session: sess,
          category: e.category,
          subjects: [],
          totalStudents: 0,
        });
      }
      const item = map.get(key);
      item.subjects.push(`${e.subjectName || e.name} (${e.totalStudents})`);
      item.totalStudents += e.totalStudents;
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [detailedExams]);

  const [selectedExamId, setSelectedExamId] = useState(() => search?.examId || "");
  const [selectedDate, setSelectedDate] = useState(() => search?.date || "");
  const [selectedSession, setSelectedSession] = useState(() => (search?.session || "morning").toLowerCase());

  // Sync date & session when query params change
  useEffect(() => {
    if (search?.date && search.date !== selectedDate) {
      setSelectedDate(search.date);
    }
    if (search?.session && search.session.toLowerCase() !== selectedSession) {
      setSelectedSession(search.session.toLowerCase());
    }
    if (search?.examId && search.examId !== selectedExamId) {
      setSelectedExamId(search.examId);
    }
    if (search?.examId && !search?.date && detailedExams.length > 0) {
      const found = detailedExams.find((e) => e.id === search.examId);
      if (found) {
        setSelectedDate(found.exam_date);
        setSelectedSession((found.session || "morning").toLowerCase());
      }
    }
  }, [search?.date, search?.session, search?.examId, detailedExams]);

  // Default to first scheduled session if none is selected
  useEffect(() => {
    if (!selectedDate && scheduledSessions.length > 0) {
      setSelectedDate(scheduledSessions[0].date);
      setSelectedSession(scheduledSessions[0].session);
    }
  }, [selectedDate, scheduledSessions]);

  // Load sitting data and groups for the selected Date and Session
  const { data: sittingData } = useQuery({
    queryKey: ["sitting_by_date", selectedDate, selectedSession],
    queryFn: () => loadGroupsForDateAndSession(selectedDate, selectedSession),
    enabled: Boolean(selectedDate && selectedSession),
  });

  const { data: saved } = useQuery({
    queryKey: ["saved_plan_by_date", selectedDate, selectedSession],
    queryFn: () => getSeatingPlanForDate(selectedDate, selectedSession),
    enabled: Boolean(selectedDate && selectedSession),
  });

  const scheduledExams = sittingData?.exams ?? [];
  const scheduledSubjects = sittingData?.subjects ?? [];
  const categoryName = sittingData?.category || "Official Examination";
  const primaryExamId = scheduledExams[0]?.id || "";
  const totalStudents = sittingData?.totalStudents ?? 0;
  const examId = primaryExamId;
  const groups = sittingData?.groups ?? [];

  const [selectedRooms, setSelectedRooms] = useState([]);
  const [strategy, setStrategy] = useState("alternate");
  const [alternateBatchA, setAlternateBatchA] = useState("");
  const [alternateBatchB, setAlternateBatchB] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [modalBlockFilter, setModalBlockFilter] = useState("all");
  const [professorsPerRoom, setProfessorsPerRoom] = useState("1");
  const [preview, setPreview] = useState(null);
  const [shortfallOpen, setShortfallOpen] = useState(false);
  const [quickRoom, setQuickRoom] = useState({ block: "Main", room_number: "", row_count: 6, seats_per_row: 6 });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailResults, setEmailResults] = useState(null);

  const { data: rooms = [], isLoading: roomsLoading } = useQuery({ queryKey: ["rooms"], queryFn: listRooms });
  const { data: duties = [] } = useQuery({
    queryKey: ["duties", examId],
    queryFn: () => listDuties(examId),
    enabled: Boolean(examId),
  });

  const activeRooms = rooms.filter((r) => r.is_active);

  const distinctBatches = sittingData?.distinctBatches ?? [];
  const isAlternationAllowed = distinctBatches.length >= 2;

  // Batches available in this exam sitting for alternate merging
  // STRICT RULE: Alternation requires 2+ DISTINCT batches! Never allow same batch alternation!
  const availableBatchOptions = useMemo(() => {
    if (distinctBatches.length < 2) return [];
    return distinctBatches.map((b) => ({
      value: b.key || b.label,
      label: b.label,
      name: b.batch_name || b.label,
      count: b.count,
      id: b.key || b.batch_id,
      batch_id: b.batch_id,
    }));
  }, [distinctBatches]);

  // Color mapping per batch for visual clarity
  const batchColorMap = useMemo(() => {
    const map = new Map();
    availableBatchOptions.forEach((b, idx) => {
      map.set(b.value, BATCH_COLOR_PALETTES[idx % BATCH_COLOR_PALETTES.length]);
    });
    return map;
  }, [availableBatchOptions]);

  // Auto-populate Batch A and Batch B when 2+ distinct batches exist

  // Auto-populate Batch A and Batch B when 2+ distinct batches exist
  useEffect(() => {
    if (availableBatchOptions.length >= 2) {
      const first = availableBatchOptions[0].value;
      const second = availableBatchOptions[1].value;
      if (!alternateBatchA || !availableBatchOptions.some((b) => b.value === alternateBatchA)) {
        setAlternateBatchA(first);
      }
      if (!alternateBatchB || !availableBatchOptions.some((b) => b.value === alternateBatchB) || alternateBatchB === first) {
        setAlternateBatchB(second);
      }
    } else {
      setAlternateBatchA("");
      setAlternateBatchB("");
    }
  }, [availableBatchOptions, alternateBatchA, alternateBatchB]);

  // Auto-select active rooms to fit totalStudents or sync with saved plan
  useEffect(() => {
    if (selectedRooms.length === 0 && activeRooms.length > 0) {
      if (saved?.seats && saved.seats.length > 0) {
        const savedRoomIds = [...new Set(saved.seats.map((s) => s.room_id))];
        setSelectedRooms(savedRoomIds);
      } else if (totalStudents > 0) {
        const sorted = [...activeRooms].sort((a, b) => {
          const bComp = a.block.localeCompare(b.block);
          if (bComp !== 0) return bComp;
          return a.room_number.localeCompare(b.room_number, undefined, { numeric: true });
        });

        let currentCapacity = 0;
        const chosen = [];
        for (const r of sorted) {
          chosen.push(r.id);
          currentCapacity += r.row_count * r.seats_per_row;
          if (currentCapacity >= totalStudents) {
            break;
          }
        }
        setSelectedRooms(chosen.length > 0 ? chosen : activeRooms.map((r) => r.id));
      }
    }
  }, [saved, activeRooms, totalStudents, selectedRooms.length]);

  // Unified display rooms (either newly generated preview or previously saved plan)
  const displayRooms = useMemo(() => {
    if (preview?.rooms && preview.rooms.length > 0) return preview.rooms;
    if (saved?.seats && saved.seats.length > 0 && rooms.length > 0) {
      const roomMap = new Map(rooms.map((r) => [r.id, r]));
      const byRoom = new Map();
      for (const seat of saved.seats) {
        if (!byRoom.has(seat.room_id)) byRoom.set(seat.room_id, []);
        byRoom.get(seat.room_id).push(seat);
      }
      const list = [];
      for (const [roomId, seatList] of byRoom) {
        const room = roomMap.get(roomId);
        if (!room) continue;
        const capacity = room.row_count * room.seats_per_row;
        list.push({
          room,
          seats: seatList,
          used: seatList.length,
          capacity,
          vacant: Math.max(0, capacity - seatList.length),
          isFull: seatList.length >= capacity,
        });
      }
      return list;
    }
    return [];
  }, [preview, saved, rooms]);

  const addQuickRoom = useMutation({
    mutationFn: () => createRoom({ ...quickRoom, row_count: Number(quickRoom.row_count), seats_per_row: Number(quickRoom.seats_per_row), is_active: true }),
    onSuccess: () => {
      toast.success("Hall added successfully");
      qc.invalidateQueries({ queryKey: ["rooms"] });
      setQuickRoom((prev) => ({ ...prev, room_number: "" }));
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedCapacity = useMemo(() => {
    return activeRooms
      .filter((r) => selectedRooms.includes(r.id))
      .reduce((sum, r) => sum + r.row_count * r.seats_per_row, 0);
  }, [activeRooms, selectedRooms]);

  const filteredActiveRooms = useMemo(() => {
    if (!roomFilter.trim()) return activeRooms;
    const term = roomFilter.toLowerCase().trim();
    return activeRooms.filter(
      (r) =>
        r.block.toLowerCase().includes(term) ||
        r.room_number.toLowerCase().includes(term),
    );
  }, [activeRooms, roomFilter]);

  const handleAutoSelectRooms = () => {
    if (totalStudents === 0) {
      toast.info("No students enrolled for this exam sitting.");
      return [];
    }
    if (activeRooms.length === 0) {
      toast.error("No active exam halls available.");
      return [];
    }

    const sorted = [...activeRooms].sort((a, b) => {
      const bComp = a.block.localeCompare(b.block);
      if (bComp !== 0) return bComp;
      return a.room_number.localeCompare(b.room_number, undefined, { numeric: true });
    });

    let currentCapacity = 0;
    const chosen = [];
    for (const r of sorted) {
      chosen.push(r.id);
      currentCapacity += r.row_count * r.seats_per_row;
      if (currentCapacity >= totalStudents) {
        break;
      }
    }

    const finalRooms = chosen.length > 0 ? chosen : activeRooms.map((r) => r.id);
    setSelectedRooms(finalRooms);
    const vacantInLast = Math.max(0, currentCapacity - totalStudents);
    toast.success(
      `Auto-selected ${finalRooms.length} hall(s) (${currentCapacity} seats for ${totalStudents} students). ${vacantInLast} vacant seat(s) remaining!`,
    );
    return finalRooms;
  };

  const handleSelectAllRooms = () => {
    setSelectedRooms(activeRooms.map((r) => r.id));
  };

  const handleClearRooms = () => {
    setSelectedRooms([]);
  };

  // Preview Seating Mutation (In-memory ONLY! Does NOT touch database!)
  const previewMut = useMutation({
    mutationFn: (roomsToUse) => {
      const targetRoomIds = Array.isArray(roomsToUse) && roomsToUse.length > 0 ? roomsToUse : selectedRooms;
      if (targetRoomIds.length === 0) {
        throw new Error("Please select at least one examination hall.");
      }
      return previewSeatingForDate(selectedDate, selectedSession, targetRoomIds, strategy, "pack_rooms", {
        batchA: alternateBatchA,
        batchB: alternateBatchB,
      });
    },
    onSuccess: (result) => {
      setPreview(result);
      if (result.unseated.length > 0) {
        setShortfallOpen(true);
        toast.warning(
          `Attention: ${result.unseated.length} student(s) could not be seated! Please select more halls.`,
        );
      } else {
        toast.info(
          `Plan preview generated for ${result.seated} students across ${result.rooms.length} hall(s). Please verify before saving!`,
        );
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // Direct trigger function: auto-picks rooms if none selected, then creates in-memory preview
  const handleGenerateDirectly = () => {
    let targetRooms = selectedRooms;
    if (targetRooms.length === 0 && activeRooms.length > 0) {
      targetRooms = handleAutoSelectRooms();
    }
    if (targetRooms.length === 0) {
      toast.error("Please add or select examination halls first.");
      return;
    }
    previewMut.mutate(targetRooms);
  };

  // Confirm & Save Plan Mutation (Strictly when user clicks "Confirm & Save")
  const savePlan = useMutation({
    mutationFn: () => {
      if (!preview) throw new Error("No seating plan preview to save.");
      return saveSeatingPlanForDate(selectedDate, selectedSession, preview, strategy);
    },
    onSuccess: () => {
      toast.success("✓ Seating plan verified and permanently saved to database!");
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["saved_plan_by_date", selectedDate, selectedSession] });
      qc.invalidateQueries({ queryKey: ["seating_plans"] });
      qc.invalidateQueries({ queryKey: ["duties", examId] });
    },
    onError: (e) => toast.error("Failed to save seating plan: " + e.message),
  });

  const handleDiscardPreview = () => {
    setPreview(null);
    toast.info("Unsaved preview cleared.");
  };

  const autoAssign = useMutation({
    mutationFn: () => {
      let targetRooms = [];
      if (preview?.rooms?.length) {
        targetRooms = preview.rooms
          .filter((r) => (r.allocated || 0) > 0 || (r.seats && r.seats.length > 0))
          .map((r) => r.room?.id || r.id);
      } else if (saved?.seats?.length) {
        targetRooms = [...new Set(saved.seats.map((a) => a.room_id))];
      } else if (selectedRooms.length > 0) {
        targetRooms = selectedRooms;
      } else {
        targetRooms = activeRooms.map((r) => r.id);
      }

      if (!targetRooms || targetRooms.length === 0) {
        throw new Error("No examination halls found in the seating plan to assign professors. Please generate or load a seating plan first.");
      }

      return autoAssignProfessors(examId, targetRooms, Number(professorsPerRoom));
    },
    onSuccess: (assignments) => {
      toast.success(`${assignments.length} professor(s) assigned as per seating plan halls!`);
      qc.invalidateQueries({ queryKey: ["duties", examId] });
      qc.invalidateQueries({ queryKey: ["professor_duties"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const dropDuty = useMutation({
    mutationFn: removeDuty,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["duties", examId] }),
  });

  async function sendEmailsToAll() {
    setSendingEmail(true);
    setEmailResults(null);
    try {
      const payload = duties.map((d) => ({
        professorEmail: d.professors?.email ?? "",
        professorName: d.professors?.name ?? "",
        duties: [{
          exam_date: d.exams?.exam_date || selectedDate,
          session: d.exams?.session || selectedSession,
          room: d.rooms ? `${d.rooms.block}/${d.rooms.room_number}` : "—",
          exam_name: d.exams?.name || scheduledSubjects.join(", "),
        }],
      }));
      const results = await sendBulkDutySummary(payload, `${categoryName} Examination`, UNIVERSITY_NAME);
      setEmailResults(results);
      const ok = results.filter((r) => r.ok).length;
      toast.success(`Emails sent: ${ok}/${results.length}`);
    } catch (err) {
      toast.error("Email dispatch failed: " + err.message);
    } finally {
      setSendingEmail(false);
    }
  }

  function downloadDutySheet() {
    if (duties.length === 0) { toast.error("No duties assigned yet"); return; }
    const rows = duties.map((d) => ({
      "Employee ID": d.professors?.employee_id ?? "",
      "Professor Name": d.professors?.name ?? "",
      "Email": d.professors?.email ?? "",
      "Exam": d.exams?.name ?? scheduledSubjects.join(", "),
      "Date": d.exams?.exam_date ?? selectedDate,
      "Session": d.exams?.session ?? selectedSession,
      "Room": d.rooms ? `${d.rooms.block} / ${d.rooms.room_number}` : "—",
      "Notified": d.notified ? "Yes" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Duties");
    XLSX.writeFile(wb, `Duties-${selectedDate}-${selectedSession}.xlsx`);
  }

  // Print full landscape desk allocation charts (1 page per hall)
  function printSeating() {
    if (displayRooms.length === 0) {
      toast.error("No seating plan to print.");
      return;
    }
    const html = buildMultiSubjectPrintHtml(
      displayRooms.map((dr) => dr.room),
      displayRooms.flatMap((dr) => dr.seats),
      {
        exam_date: selectedDate,
        session: selectedSession,
        category: categoryName,
      },
      scheduledSubjects.length > 0
        ? scheduledSubjects.map((s) => ({ name: s }))
        : [{ name: `${categoryName} Examination` }],
      UNIVERSITY_NAME,
      strategy,
    );
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Pop-up blocked. Please allow pop-ups for printing.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  }

  // Active rooms to display in visual grid
  const visibleRooms = useMemo(() => {
    if (selectedRoomId === "all") {
      return displayRooms;
    }
    return displayRooms.filter((r) => r.room.id === selectedRoomId);
  }, [displayRooms, selectedRoomId]);

  // Seating Status Flags
  const isUnsavedPreview = Boolean(preview && preview.rooms && preview.rooms.length > 0);
  const isSavedPlan = Boolean(!preview && saved?.seats && saved.seats.length > 0);
  const hasNoPlan = Boolean(!isUnsavedPreview && !isSavedPlan);

  // Switch Exam by Subject / Paper selection
  const handleSelectExamByPaper = (examObjId) => {
    const found = detailedExams.find((e) => e.id === examObjId);
    if (found) {
      setSelectedExamId(found.id);
      setSelectedDate(found.exam_date);
      setSelectedSession((found.session || "morning").toLowerCase());
      setPreview(null);
      void navigate({
        to: "/exams/seating",
        search: {
          examId: found.id,
          date: found.exam_date,
          session: (found.session || "morning").toLowerCase(),
        },
      });
    }
  };

  return (
    <AdminLayout
      title="Examination Seating Arrangement"
      description="Direct seating generator, preview verification, classroom desk grids, and faculty duty management"
    >
      <div className="space-y-4">
        {/* ========================================================================= */}
        {/* TOP VIEW TABS: SEATING WORKSPACE | EXAM HALLS | INVIGILATOR DUTIES        */}
        {/* ========================================================================= */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab("plan")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "plan"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Wand2 className="size-3.5" />
              Seating Arrangement Workspace
              {displayRooms.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-background/20 text-white">
                  {displayRooms.length} Halls
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("rooms")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "rooms"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Building2 className="size-3.5" />
              Exam Halls &amp; Capacity
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                selectedCapacity >= totalStudents ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-destructive/15 text-destructive"
              }`}>
                {selectedRooms.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("duties")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "duties"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Users className="size-3.5" />
              Invigilator Duties
              {duties.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300">
                  {duties.length}
                </span>
              )}
            </button>
          </div>

          {/* Strength Indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sitting Strength:</span>
            <Badge variant="outline" className="font-mono text-xs font-bold border-primary/40 text-primary bg-primary/5">
              {totalStudents} Students
            </Badge>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MAIN TAB 1: 2-COLUMN SEATING ENGINE WORKSPACE                            */}
        {/* Left Col: Examination Details & Generation                                */}
        {/* Right Col: Seating Plan Verification & Classroom Desk Layout              */}
        {/* ========================================================================= */}
        {activeTab === "plan" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* --------------------------------------------------------------------- */}
            {/* LEFT COLUMN: EXAMINATION DETAILS & SETUP (lg:col-span-4)              */}
            {/* --------------------------------------------------------------------- */}
            <div className="lg:col-span-4 xl:col-span-4 space-y-4">
              {/* Card 1: Exam & Subject Selection */}
              <div className="panel p-4 space-y-4 bg-card border-border shadow-xs">
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                      <BookOpen className="size-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground">Examination Details</h3>
                      <p className="text-[11px] text-muted-foreground">Select subject, date &amp; session</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/30">
                    Step 1
                  </Badge>
                </div>

                {/* Subject / Paper Quick Pick Dropdown */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Select Scheduled Subject / Exam:</span>
                    {detailedExams.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{detailedExams.length} scheduled</span>
                    )}
                  </Label>
                  {detailedExams.length === 0 ? (
                    <div className="p-2.5 rounded-lg border border-dashed border-border bg-muted/20 text-center space-y-1.5">
                      <p className="text-xs text-muted-foreground">No scheduled exams found.</p>
                      <Link to="/exams" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                        + Schedule Examination in Manager →
                      </Link>
                    </div>
                  ) : (
                    <Select
                      value={selectedExamId || (scheduledExams[0]?.id || "")}
                      onValueChange={(val) => handleSelectExamByPaper(val)}
                    >
                      <SelectTrigger className="w-full text-xs h-9 bg-card">
                        <SelectValue placeholder="Choose Subject / Paper..." />
                      </SelectTrigger>
                      <SelectContent>
                        {detailedExams.map((e) => (
                          <SelectItem key={e.id} value={e.id} className="text-xs py-1.5">
                            <div className="flex flex-col text-left">
                              <span className="font-semibold text-foreground">
                                {e.subjectName || e.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {e.exam_date} · {e.session} · {e.totalStudents} students
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Manual Date & Session Controls */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Exam Date</Label>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setPreview(null);
                        void navigate({ to: "/exams/seating", search: { date: e.target.value, session: selectedSession } });
                      }}
                      className="h-8 text-xs font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Session</Label>
                    <Select
                      value={selectedSession}
                      onValueChange={(val) => {
                        setSelectedSession(val);
                        setPreview(null);
                        void navigate({ to: "/exams/seating", search: { date: selectedDate, session: val } });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="morning">Morning (09:30 AM)</SelectItem>
                        <SelectItem value="afternoon">Afternoon (01:30 PM)</SelectItem>
                        <SelectItem value="evening">Evening (05:00 PM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Examination Info Card (Active Sitting Details) */}
                {scheduledExams.length > 0 ? (
                  <div className="p-3.5 rounded-lg border border-primary/20 bg-primary/5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-primary tracking-wider block">
                          {categoryName}
                        </span>
                        <h4 className="font-bold text-sm text-foreground">
                          {scheduledSubjects.join(", ") || "Examination Sitting"}
                        </h4>
                      </div>
                      <Badge className="bg-primary text-primary-foreground font-mono text-xs px-2 py-0.5">
                        {totalStudents} Students
                      </Badge>
                    </div>

                    {/* Appearing Batches */}
                    <div className="space-y-1 pt-1.5 border-t border-primary/15">
                      <span className="text-[11px] font-semibold text-muted-foreground block">
                        Appearing Batches &amp; Sections ({groups.length}):
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
                        {groups.map((g, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-card border border-border text-foreground"
                          >
                            <span>{g.label}</span>
                            <span className="text-primary font-bold">({g.students.length})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-amber-300/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5" /> No exam scheduled on this date/session
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Select another date or subject above, or schedule papers in the Examination section.
                    </p>
                  </div>
                )}
              </div>

              {/* Card 2: Seating Configuration & Strategy */}
              <div className="panel p-4 space-y-3.5 bg-card border-border shadow-xs">
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                      <SlidersHorizontal className="size-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground">Seating Strategy</h3>
                      <p className="text-[11px] text-muted-foreground">Select student desk distribution pattern</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/30">
                    Step 2
                  </Badge>
                </div>

                {/* Strategy Toggle */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setStrategy("simple")}
                      className={`p-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                        strategy === "simple"
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30 shadow-2xs"
                          : "border-border hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <span>Simple Seating</span>
                      <span className="text-[10px] font-normal opacity-80">Sequential Column-wise</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStrategy("alternate")}
                      className={`p-2.5 rounded-lg border text-xs font-semibold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                        strategy === "alternate"
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30 shadow-2xs"
                          : "border-border hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <Sparkles className="size-3" /> Alternate Seating
                      </span>
                      <span className="text-[10px] font-normal opacity-80">
                        {isAlternationAllowed
                          ? "Merge 2 Batches Column-wise"
                          : "TC06: Empty Buffer Desks (1, 3, 5...)"}
                      </span>
                    </button>
                  </div>

                  {/* Informational banner when sitting has only 1 batch */}
                  {!isAlternationAllowed && (
                    <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 text-foreground text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-primary">
                        <Sparkles className="size-3.5" />
                        <span>Single Batch: {distinctBatches[0]?.label || "1 Batch"}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {strategy === "alternate" ? (
                          <>
                            <strong className="text-foreground">TC06 Active (Alternate with Empty Buffer Desks):</strong> Students are placed on alternate desks (Desk 1, 3, 5...) leaving empty buffer desks in between to prevent copying.
                          </>
                        ) : (
                          <>
                            <strong className="text-foreground">Simple Sequential Seating:</strong> Students are seated sequentially on every desk. Click <strong>Alternate Seating</strong> above to enable empty buffer desks (TC06).
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Alternate Batch Selectors (Shown strictly when 2+ distinct batches exist) */}
                  {isAlternationAllowed && strategy === "alternate" && (
                    <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2.5 text-xs">
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-foreground">Batch 1 (Column 1):</span>
                        <Select
                          value={alternateBatchA}
                          onValueChange={(val) => {
                            setAlternateBatchA(val);
                            if (val === alternateBatchB) {
                              const other = availableBatchOptions.find((b) => b.value !== val);
                              if (other) setAlternateBatchB(other.value);
                            }
                          }}
                        >
                          <SelectTrigger className="w-full h-8 text-xs bg-card">
                            <SelectValue placeholder="Choose Batch A" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableBatchOptions.map((b) => (
                              <SelectItem key={b.value} value={b.value} disabled={b.value === alternateBatchB}>
                                {b.label} ({b.count} students)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] text-primary gap-1"
                          onClick={() => {
                            const temp = alternateBatchA;
                            setAlternateBatchA(alternateBatchB);
                            setAlternateBatchB(temp);
                          }}
                        >
                          <ArrowRightLeft className="size-3" /> Swap Batches
                        </Button>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-foreground">Batch 2 (Column 2):</span>
                        <Select
                          value={alternateBatchB}
                          onValueChange={(val) => {
                            if (val === alternateBatchA) {
                              toast.error("Batch A and Batch B must be different. Alternating the same batch is not permitted.");
                              return;
                            }
                            setAlternateBatchB(val);
                          }}
                        >
                          <SelectTrigger className="w-full h-8 text-xs bg-card">
                            <SelectValue placeholder="Choose Batch B" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableBatchOptions.filter((b) => b.value !== alternateBatchA).map((b) => (
                              <SelectItem key={b.value} value={b.value}>
                                {b.label} ({b.count} students)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <p className="text-[10px] text-muted-foreground pt-1">
                        Zero copying guarantee: students of Batch A and Batch B sit in alternate columns.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: Hall Capacity & Direct Generation Button */}
              <div className="panel p-4 space-y-3.5 bg-card border-border shadow-xs">
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                      <Building2 className="size-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground">Exam Halls &amp; Capacity</h3>
                      <p className="text-[11px] text-muted-foreground">Allocation capacity check</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/30">
                    Step 3
                  </Badge>
                </div>

                {/* Capacity Summary */}
                <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Required Seats:</span>
                    <span className="font-bold text-foreground">{totalStudents}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Selected Capacity:</span>
                    <span className={`font-bold ${selectedCapacity >= totalStudents ? "text-emerald-600" : "text-destructive"}`}>
                      {selectedCapacity} Seats ({selectedRooms.length} halls)
                    </span>
                  </div>

                  <div className="pt-1 flex items-center justify-between gap-2">
                    {selectedCapacity >= totalStudents ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 gap-1 text-[11px]">
                        <Check className="size-3" /> Sufficient (+{selectedCapacity - totalStudents} extra)
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1 text-[11px]">
                        <AlertTriangle className="size-3" /> Need {totalStudents - selectedCapacity} more!
                      </Badge>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHallModalOpen(true)}
                      className="h-7 text-[11px] gap-1"
                    >
                      Manage Halls ({selectedRooms.length})
                    </Button>
                  </div>
                </div>

                {/* PRIMARY ACTION: GENERATE SEATING PLAN BUTTON */}
                <div className="pt-2 space-y-2">
                  <Button
                    onClick={handleGenerateDirectly}
                    disabled={groups.length === 0 || previewMut.isPending}
                    className="w-full h-10 text-xs font-bold gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all cursor-pointer"
                  >
                    {previewMut.isPending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Generating Plan...
                      </>
                    ) : (
                      <>
                        <Wand2 className="size-4" />
                        Generate Seating Plan (Preview)
                      </>
                    )}
                  </Button>

                  <p className="text-[11px] text-muted-foreground text-center">
                    Generating creates an in-memory preview. It will NOT be saved until verified and confirmed.
                  </p>
                </div>
              </div>
            </div>

            {/* --------------------------------------------------------------------- */}
            {/* RIGHT COLUMN: SEATING PLAN VERIFICATION & CLASSROOM DESK GRID        */}
            {/* --------------------------------------------------------------------- */}
            <div className="lg:col-span-8 xl:col-span-8 space-y-4">
              {/* STATE 1: UNSAVED PREVIEW (Verification Pending) */}
              {isUnsavedPreview && (
                <div className="panel p-4.5 border-2 border-amber-500/60 bg-amber-500/10 dark:bg-amber-950/20 space-y-3.5 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-amber-500 text-white font-bold text-xs gap-1 py-0.5">
                          <AlertTriangle className="size-3.5" /> PREVIEW ONLY (UNSAVED)
                        </Badge>
                        <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                          Verification Required Before Saving
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        Please review the classroom desk layout below. The seating arrangement will <strong>NOT be saved</strong> to the database until you click <strong>&quot;Confirm &amp; Save Seating Plan&quot;</strong>.
                      </p>
                    </div>

                    {/* Prominent Save / Discard Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDiscardPreview}
                        className="h-9 text-xs border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20"
                      >
                        <X className="size-3.5 mr-1" /> Discard
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => savePlan.mutate()}
                        disabled={savePlan.isPending}
                        className="h-9 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm ring-2 ring-emerald-500/30"
                      >
                        {savePlan.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        Confirm &amp; Save Seating Plan
                      </Button>
                    </div>
                  </div>

                  {/* Verification Quick Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-md bg-card border border-amber-500/30">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">Seated Students:</span>
                      <span className="text-base font-bold text-foreground">
                        {preview.seated} / {totalStudents}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-md bg-card border border-amber-500/30">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">Unseated Count:</span>
                      <span className={`text-base font-bold ${preview.unseated.length === 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {preview.unseated.length} Students
                      </span>
                    </div>

                    <div className="p-2.5 rounded-md bg-card border border-amber-500/30">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">Halls Used:</span>
                      <span className="text-base font-bold text-foreground">
                        {preview.rooms.length} Halls
                      </span>
                    </div>

                    <div className="p-2.5 rounded-md bg-card border border-amber-500/30">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">Pattern:</span>
                      <span className="text-xs font-semibold text-foreground capitalize truncate block mt-0.5">
                        {strategy.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* STATE 2: SAVED & ACTIVE SEATING PLAN */}
              {isSavedPlan && (
                <div className="panel p-4.5 border-2 border-emerald-500/50 bg-emerald-500/10 dark:bg-emerald-950/20 space-y-3.5 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-500/20 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-600 text-white font-bold text-xs gap-1 py-0.5">
                          <CheckCircle2 className="size-3.5" /> CONFIRMED &amp; SAVED PLAN
                        </Badge>
                        <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                          Active in Database
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
                        This seating plan is confirmed. You can print room charts, export to Excel, and allocate invigilator duties.
                      </p>
                    </div>

                    {/* Management Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={printSeating}
                        title="Print Landscape Desk Maps for each examination hall"
                        className="h-8 text-xs gap-1.5 bg-card font-semibold"
                      >
                        <Printer className="size-3.5 text-primary" /> Print Seating Plan
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          exportSeatingWorkbook(
                            saved?.seats || [],
                            new Map(rooms.map((r) => [r.id, r])),
                            `${categoryName}_${selectedDate}_${selectedSession}`,
                          )
                        }
                        className="h-8 text-xs gap-1.5 bg-card font-semibold"
                      >
                        <Download className="size-3.5 text-primary" /> Export Excel
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => setActiveTab("duties")}
                        className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
                      >
                        <Users className="size-3.5" /> Assign Duties ({duties.length})
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleGenerateDirectly}
                        title="Re-run seating generator to create a new preview"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <RotateCcw className="size-3.5 mr-1" /> Re-plan
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Total Seated: <strong className="text-foreground">{saved.seats?.length || 0} students</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Halls Utilized: <strong className="text-foreground">{displayRooms.length} halls</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Strategy: <strong className="text-foreground uppercase">{saved.plan?.strategy || strategy}</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* STATE 3: NO PLAN YET (Empty State) */}
              {hasNoPlan && (
                <div className="panel p-10 text-center space-y-4 bg-card/60 border-dashed border-2 border-border">
                  <div className="size-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
                    <Wand2 className="size-6" />
                  </div>
                  <div className="space-y-1 max-w-md mx-auto">
                    <h3 className="font-bold text-base text-foreground">No Seating Plan Generated Yet</h3>
                    <p className="text-xs text-muted-foreground">
                      Select the examination details on the left, then click <strong>&quot;Generate Seating Plan&quot;</strong> to preview allocations.
                    </p>
                  </div>
                  <div className="flex justify-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={handleGenerateDirectly}
                      disabled={groups.length === 0 || previewMut.isPending}
                      className="text-xs gap-1.5 font-semibold"
                    >
                      {previewMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                      Generate Seating Plan
                    </Button>
                  </div>
                </div>
              )}

              {/* =================================================================== */}
              {/* CLASSROOM SEATING ARRANGEMENT DESK GRIDS                             */}
              {/* =================================================================== */}
              {displayRooms.length > 0 && (
                <div className="space-y-4">
                  {/* Hall Switcher Tabs Bar */}
                  <div className="panel p-3 bg-card border-border shadow-xs flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">
                        Hall:
                      </span>
                      <button
                        onClick={() => setSelectedRoomId("all")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          selectedRoomId === "all"
                            ? "bg-primary text-primary-foreground shadow-2xs"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        All Halls ({displayRooms.length})
                      </button>
                      {displayRooms.map((dr) => (
                        <button
                          key={dr.room.id}
                          onClick={() => setSelectedRoomId(dr.room.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            selectedRoomId === dr.room.id
                              ? "bg-primary text-primary-foreground font-bold shadow-2xs"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          {dr.room.block} / {dr.room.room_number} ({dr.used}/{dr.capacity})
                        </button>
                      ))}
                    </div>

                    {/* Legend of Batches */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {groups.map((g) => {
                        const palette = batchColorMap.get(g.label) || BATCH_COLOR_PALETTES[0];
                        return (
                          <span
                            key={g.label}
                            className={`text-[10.5px] font-semibold px-2 py-0.5 rounded border ${palette.bg} ${palette.border} ${palette.text}`}
                          >
                            {g.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Room Desks */}
                  <div className="space-y-6">
                    {visibleRooms.map((r) => {
                      const grid = buildRoomGrid(r.seats, r.room.row_count, r.room.seats_per_row);
                      const groupsInRoom = [...new Set(r.seats.map((s) => s.group_label))].filter(Boolean);

                      return (
                        <div key={r.room.id} className="panel p-5 space-y-4 bg-card border-border shadow-xs">
                          {/* Room Header Banner */}
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-lg text-foreground">
                                  {r.room.block} / {r.room.room_number}
                                </h3>
                                <Badge variant="outline" className="text-xs font-bold border-primary/30 text-primary">
                                  {r.used} / {r.capacity} Seats Filled
                                </Badge>
                                {r.vacant > 0 && (
                                  <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-300">
                                    {r.vacant} Vacant Seats
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Layout: {r.room.row_count} Rows × {r.room.seats_per_row} Columns
                              </p>
                            </div>

                            {/* Batches inside this hall */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {groupsInRoom.map((label) => {
                                const palette = batchColorMap.get(label) || BATCH_COLOR_PALETTES[0];
                                return (
                                  <span
                                    key={label}
                                    className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${palette.bg} ${palette.border} ${palette.text}`}
                                  >
                                    {label}
                                  </span>
                                );
                              })}
                            </div>
                          </div>

                          {/* Front Blackboard Marker */}
                          <div className="w-full max-w-xl mx-auto text-center py-1.5 px-4 rounded-md bg-muted/60 border border-border text-[11px] font-bold text-muted-foreground uppercase tracking-widest shadow-2xs">
                            ━━ FRONT OF ROOM / BLACKBOARD &amp; INVIGILATOR DESK ━━
                          </div>

                          {/* Classroom Desks Table */}
                          <div className="overflow-x-auto pb-2">
                            <table className="text-xs border-collapse mx-auto">
                              <thead>
                                <tr>
                                  <th className="p-1.5 text-[10px] text-muted-foreground font-mono">Row</th>
                                  {Array.from({ length: r.room.seats_per_row }, (_, i) => (
                                    <th key={i} className="p-1.5 text-[11px] text-muted-foreground font-semibold text-center min-w-[95px]">
                                      Column {i + 1}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/40">
                                {grid.map((rowCells, rowIdx) => (
                                  <tr key={rowIdx}>
                                    <td className="p-1.5 font-mono text-xs text-muted-foreground font-bold text-center pr-3">
                                      R{rowIdx + 1}
                                    </td>
                                    {rowCells.map((cell, colIdx) => {
                                      const palette = cell.student ? (batchColorMap.get(cell.group_label) || BATCH_COLOR_PALETTES[0]) : null;

                                      return (
                                        <td key={colIdx} className="p-1.5 text-center">
                                          <div
                                            className={`p-2 rounded-lg text-xs flex flex-col items-center justify-center transition-all ${
                                              cell.isVacant
                                                ? "border border-dashed border-border/80 bg-muted/20 text-muted-foreground/60 min-h-[58px]"
                                                : `border ${palette.border} ${palette.bg} shadow-2xs min-h-[58px]`
                                            }`}
                                          >
                                            {cell.isVacant ? (
                                              <span className="font-mono text-[10px] text-muted-foreground font-medium">
                                                {strategy === "alternate" && !isAlternationAllowed
                                                  ? "Empty Buffer"
                                                  : "Vacant Seat"}
                                              </span>
                                            ) : (
                                              <>
                                                <div className="flex items-center justify-between w-full text-[9px] font-mono text-muted-foreground mb-0.5">
                                                  <span>R{rowIdx + 1}-S{colIdx + 1}</span>
                                                  {cell.group_label && (
                                                    <span className={`text-[8.5px] px-1 rounded ${palette.badge} font-semibold truncate max-w-[50px]`}>
                                                      {cell.group_label.split(" ")[0]}
                                                    </span>
                                                  )}
                                                </div>
                                                <span
                                                  className="font-bold font-mono text-xs text-foreground block truncate max-w-[85px]"
                                                  title={cell.student?.registration_number || cell.student?.roll_number}
                                                >
                                                  {cell.student?.registration_number || cell.student?.roll_number || "—"}
                                                </span>
                                                <span
                                                  className="text-[10px] text-muted-foreground block truncate max-w-[85px]"
                                                  title={cell.student?.name}
                                                >
                                                  {cell.student?.name || "Student"}
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: EXAM HALLS & CAPACITY SELECTOR                                     */}
        {/* ========================================================================= */}
        {activeTab === "rooms" && (
          <div className="space-y-4">
            <div className="panel p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                    <Building2 className="size-4 text-primary" /> Examination Halls Selection
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select halls to be utilized for this exam sitting. Use Auto-Select to automatically pick the best combination to minimize vacant seats.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleSelectAllRooms} className="h-8 text-xs">
                    Select All ({activeRooms.length})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleClearRooms} disabled={selectedRooms.length === 0} className="h-8 text-xs text-muted-foreground">
                    Clear Selection
                  </Button>
                  <RoomImportDialog triggerText="Import Halls (Excel)" size="sm" />
                </div>
              </div>

              {/* Capacity Progress Meter */}
              <div className="p-3.5 rounded-lg border border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Required:</span>
                    <p className="text-lg font-bold text-foreground">{totalStudents} Students</p>
                  </div>
                  <span className="text-xl text-muted-foreground font-light">/</span>
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Selected Capacity:</span>
                    <p className={`text-lg font-bold ${selectedCapacity >= totalStudents ? "text-emerald-600" : "text-destructive"}`}>
                      {selectedCapacity} Seats ({selectedRooms.length} halls)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedCapacity >= totalStudents ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 gap-1 text-xs py-1">
                      <Check className="size-3.5" /> Sufficient Capacity ({selectedCapacity - totalStudents} extra seats)
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1 text-xs py-1">
                      <AlertTriangle className="size-3.5" /> Need {totalStudents - selectedCapacity} more seats!
                    </Badge>
                  )}
                  <Button size="sm" onClick={handleAutoSelectRooms} className="h-8 text-xs gap-1.5">
                    <Sparkles className="size-3.5" /> Auto-Select Optimal Halls
                  </Button>
                </div>
              </div>

              {/* Hall Search */}
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter halls by room or block..."
                  value={roomFilter}
                  onChange={(e) => setRoomFilter(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              {/* Hall Checkbox Grid */}
              {roomsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
                </div>
              ) : activeRooms.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">No active halls configured. Import halls above.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {filteredActiveRooms.map((room) => {
                    const checked = selectedRooms.includes(room.id);
                    return (
                      <label
                        key={room.id}
                        className={`flex cursor-pointer flex-col justify-between p-3 rounded-lg border transition-all ${
                          checked
                            ? "border-primary bg-primary/10 shadow-2xs ring-1 ring-primary/40"
                            : "border-border hover:border-muted-foreground/60 bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-foreground">
                            {room.block} / {room.room_number}
                          </span>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              setSelectedRooms((prev) => v ? [...prev, room.id] : prev.filter((id) => id !== room.id))
                            }
                          />
                        </div>
                        <div className="text-xs text-muted-foreground mt-2 flex items-center justify-between">
                          <span>{room.row_count}r × {room.seats_per_row}c</span>
                          <span className="font-bold text-foreground">{room.row_count * room.seats_per_row} seats</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Quick Add Room */}
              <div className="pt-3 border-t border-border flex flex-wrap gap-2 items-center text-xs">
                <span className="text-muted-foreground font-semibold">Quick add new hall:</span>
                <Input className="w-24 h-8 text-xs" placeholder="Block" value={quickRoom.block} onChange={(e) => setQuickRoom({ ...quickRoom, block: e.target.value })} />
                <Input className="w-24 h-8 text-xs" placeholder="Room No" value={quickRoom.room_number} onChange={(e) => setQuickRoom({ ...quickRoom, room_number: e.target.value })} />
                <Input className="w-16 h-8 text-xs" type="number" min="1" placeholder="Rows" value={quickRoom.row_count} onChange={(e) => setQuickRoom({ ...quickRoom, row_count: e.target.value })} />
                <Input className="w-16 h-8 text-xs" type="number" min="1" placeholder="Cols" value={quickRoom.seats_per_row} onChange={(e) => setQuickRoom({ ...quickRoom, seats_per_row: e.target.value })} />
                <Button size="sm" className="h-8 text-xs gap-1" onClick={() => addQuickRoom.mutate()} disabled={!quickRoom.room_number}>
                  <Plus className="size-3.5" /> Add Hall
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: INVIGILATOR DUTIES                                                 */}
        {/* ========================================================================= */}
        {activeTab === "duties" && (
          <div className="space-y-4">
            <div className="panel p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                    <Users className="size-4 text-primary" /> Invigilation Duty Allocations
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Invigilators are assigned strictly to the halls used in the seating plan, excluding faculty on approved leave.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select value={professorsPerRoom} onValueChange={setProfessorsPerRoom}>
                    <SelectTrigger className="w-48 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROF_PER_ROOM_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button size="sm" onClick={() => autoAssign.mutate()} disabled={autoAssign.isPending} className="h-8 text-xs gap-1.5">
                    {autoAssign.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    Auto-Assign Invigilators
                  </Button>

                  <Button variant="outline" size="sm" onClick={downloadDutySheet} disabled={duties.length === 0} className="h-8 text-xs gap-1.5">
                    <FileSpreadsheet className="size-3.5" /> Export Sheet
                  </Button>

                  <Button size="sm" onClick={sendEmailsToAll} disabled={duties.length === 0 || sendingEmail} className="h-8 text-xs gap-1.5">
                    {sendingEmail ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
                    Email Faculty
                  </Button>
                </div>
              </div>

              {emailResults && (
                <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs flex flex-wrap gap-2">
                  {emailResults.map((r, i) => (
                    <span key={i} className={r.ok ? "text-emerald-700" : "text-destructive"}>
                      {r.email}: {r.ok ? "✓ sent" : `✗ ${r.error}`}
                    </span>
                  ))}
                </div>
              )}

              {duties.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <Users className="size-8 text-muted-foreground mx-auto" />
                  <p className="font-semibold text-sm text-foreground">No invigilators assigned yet.</p>
                  <p className="text-xs text-muted-foreground">
                    Click <strong>Auto-Assign Invigilators</strong> above to distribute faculty across seated exam halls.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Faculty Member</th>
                        <th className="px-4 py-2.5 font-medium">Employee ID</th>
                        <th className="px-4 py-2.5 font-medium">Department</th>
                        <th className="px-4 py-2.5 font-medium">Assigned Examination Hall</th>
                        <th className="px-4 py-2.5 font-medium text-center">Notification</th>
                        <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {duties.map((d) => (
                        <tr key={d.id} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-semibold text-foreground">
                            {d.professors?.name ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                            {d.professors?.employee_id ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {d.professors?.department ?? "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className="font-bold text-primary text-xs">
                              {d.rooms ? `${d.rooms.block} / ${d.rooms.room_number}` : "—"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge variant={d.notified ? "default" : "outline"} className="text-[11px]">
                              {d.notified ? "✓ Notified" : "Pending Email"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => dropDuty.mutate(d.id)}
                              disabled={dropDuty.isPending}
                              title="Remove Duty"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* QUICK HALLS SELECTION MODAL (Triggered from Left Column)                  */}
      {/* ========================================================================= */}
      <Dialog open={hallModalOpen} onOpenChange={setHallModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-primary" /> Select Examination Halls
            </DialogTitle>
            <DialogDescription>
              Choose halls to be used for this exam sitting. Capacity required: <strong>{totalStudents} students</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            {/* Header metrics & quick actions */}
            <div className="p-3 rounded-lg border border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Capacity Status:</span>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-bold ${selectedCapacity >= totalStudents ? "text-emerald-600" : "text-destructive"}`}>
                    {selectedCapacity} / {totalStudents} Seats
                  </span>
                  <Badge variant={selectedCapacity >= totalStudents ? "default" : "destructive"} className="text-[10px] py-0 px-1.5">
                    {selectedCapacity >= totalStudents ? `✓ ${Math.round((selectedCapacity / (totalStudents || 1)) * 100)}% Coverage` : `Deficit: ${totalStudents - selectedCapacity}`}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Button size="sm" variant="outline" onClick={handleAutoSelectRooms} className="h-7 text-xs gap-1 font-semibold">
                  <Sparkles className="size-3 text-primary" /> Auto-Select Optimal
                </Button>
                <Button size="sm" variant="ghost" onClick={handleSelectAllRooms} className="h-7 text-xs">
                  Select All ({activeRooms.length})
                </Button>
                <Button size="sm" variant="ghost" onClick={handleClearRooms} className="h-7 text-xs text-muted-foreground">
                  Clear
                </Button>
              </div>
            </div>

            {/* Campus Block Filters & Block Bulk Select inside Dialog */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-border pb-2">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-muted-foreground font-semibold text-[10px] uppercase mr-1">Block:</span>
                {["all", ...new Set(activeRooms.map((r) => r.block).filter(Boolean))].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setModalBlockFilter(b)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
                      modalBlockFilter === b
                        ? "bg-primary text-primary-foreground font-bold shadow-2xs"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {b === "all" ? "All" : b}
                  </button>
                ))}
              </div>

              {modalBlockFilter !== "all" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10.5px] px-2 text-primary"
                  onClick={() => {
                    const blockRoomIds = activeRooms.filter((r) => r.block === modalBlockFilter).map((r) => r.id);
                    setSelectedRooms((prev) => [...new Set([...prev, ...blockRoomIds])]);
                    toast.success(`Selected all halls in ${modalBlockFilter}`);
                  }}
                >
                  + Select All in {modalBlockFilter}
                </Button>
              )}
            </div>

            {/* Grid of halls */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-1">
              {activeRooms
                .filter((r) => modalBlockFilter === "all" || r.block === modalBlockFilter)
                .map((room) => {
                  const checked = selectedRooms.includes(room.id);
                  return (
                    <label
                      key={room.id}
                      className={`flex cursor-pointer flex-col justify-between p-2.5 rounded-lg border text-xs transition-all ${
                        checked
                          ? "border-primary bg-primary/10 ring-1 ring-primary/40 font-medium"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{room.block} / {room.room_number}</span>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setSelectedRooms((prev) => v ? [...prev, room.id] : prev.filter((id) => id !== room.id))
                          }
                        />
                      </div>
                      <span className="text-muted-foreground text-[11px] mt-1">
                        {room.row_count * room.seats_per_row} seats ({room.row_count}r × {room.seats_per_row}c)
                      </span>
                    </label>
                  );
                })}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setHallModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shortfall dialog */}
      <Dialog open={shortfallOpen} onOpenChange={setShortfallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              {preview?.unseated?.length} student(s) could not be seated
            </DialogTitle>
            <DialogDescription>
              The selected examination halls do not have enough capacity. Please select more rooms from the Exam Halls tab or click &quot;Auto-Select Optimal Halls&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto text-sm space-y-1">
            {preview?.unseated?.map((u) => (
              <div key={u.student_id} className="flex justify-between text-xs py-1 border-b">
                <span className="font-mono">{u.registration_number}</span>
                <span className="text-muted-foreground">{u.group_label}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShortfallOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
