import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useMemo } from "react";
import {
  Plus, Pencil, Trash2, Upload, Download, Mail, Loader2, AlertTriangle, Sparkles,
  Calendar, CheckCircle2, Check, X, ChevronLeft, ChevronRight, CalendarDays,
  UserCheck, UserX, Clock, Coffee, Eye, RotateCcw, Filter, AlertCircle, ShieldCheck,
  CalendarRange, CheckCircle, XCircle, SunMedium, Users
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  listProfessors, createProfessor, updateProfessor, deleteProfessor,
  importProfessorsFromRows, importLeavesFromRows, listLeaves,
  listDuties, assignDuty, removeDuty, autoAssignProfessors,
  approveLeave, rejectLeave, revertLeaveToPending, removeLeave
} from "@/lib/professors";

export const Route = createFileRoute("/_authenticated/professors/")({
  head: () => ({
    meta: [{ title: "Professors & Invigilation Management | Exam Branch" }],
  }),
  component: ProfessorsPage,
});

const EMPTY_FORM = {
  employee_id: "", name: "", department: "", email: "", phone: "", max_duties: 10,
};

function getLeaveStatus(leave) {
  if (leave.approved) return "approved";
  if (leave.reason?.startsWith("[REJECTED]")) return "rejected";
  return "pending";
}

function getCleanReason(reason) {
  if (!reason) return "Personal Leave";
  return reason.replace(/^\[REJECTED\]\s*/, "");
}

function ProfessorsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("list"); // "list" | "duties" | "leaves" | "import"
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [leaveImportResult, setLeaveImportResult] = useState(null);
  const profFileRef = useRef();
  const leaveFileRef = useRef();

  // Duties State
  const [examFilter, setExamFilter] = useState("all");
  const [autoAssignOpen, setAutoAssignOpen] = useState(false);
  const [manualAssignOpen, setManualAssignOpen] = useState(false);
  const [autoExamId, setAutoExamId] = useState("");
  const [autoProfPerRoom, setAutoProfPerRoom] = useState(1);
  const [manualForm, setManualForm] = useState({ professor_id: "", exam_id: "", room_id: "" });

  // Calendar & Leave Approvals State
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth()); // 0-11
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState("all"); // "all" | "pending" | "approved" | "rejected"
  const [rejectDialogItem, setRejectDialogItem] = useState(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState("");
  const [showDayFacultyRoster, setShowDayFacultyRoster] = useState(false);

  // Queries
  const { data: professors = [], isLoading } = useQuery({
    queryKey: ["professors"],
    queryFn: listProfessors,
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ["professor_leaves"],
    queryFn: () => listLeaves(),
  });

  const { data: duties = [], isLoading: loadingDuties } = useQuery({
    queryKey: ["professor_duties", examFilter],
    queryFn: () => listDuties(examFilter === "all" ? undefined : examFilter),
  });

  const { data: allExams = [] } = useQuery({
    queryKey: ["all_exams_list"],
    queryFn: async () => {
      const { data } = await supabase.from("exams").select("id, name, exam_date, session").order("exam_date", { ascending: false });
      return data || [];
    },
  });

  const { data: allRooms = [] } = useQuery({
    queryKey: ["all_rooms_list"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, block, room_number, capacity").eq("is_active", true).order("room_number");
      return data || [];
    },
  });

  // Auto-Assign Invigilators (Prioritizes seated rooms from Seating Plan)
  const autoAssign = useMutation({
    mutationFn: async () => {
      if (!autoExamId) throw new Error("Please select an examination");

      // Check if this exam sitting has a generated or saved seating plan
      let roomIds = [];
      const { data: plan } = await supabase
        .from("seating_plans")
        .select("id")
        .eq("exam_id", autoExamId)
        .maybeSingle();

      if (plan) {
        const { data: allocations } = await supabase
          .from("seat_allocations")
          .select("room_id")
          .eq("plan_id", plan.id);
        if (allocations && allocations.length > 0) {
          roomIds = [...new Set(allocations.map((a) => a.room_id))];
        }
      }

      if (roomIds.length === 0) {
        roomIds = allRooms.map((r) => r.id);
      }

      if (roomIds.length === 0) throw new Error("No active exam halls available");
      return autoAssignProfessors(autoExamId, roomIds, Number(autoProfPerRoom));
    },
    onSuccess: (res) => {
      toast.success(`Successfully auto-assigned ${res.length} professor duties as per seating plan!`);
      setAutoAssignOpen(false);
      qc.invalidateQueries({ queryKey: ["professor_duties"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const manualAssign = useMutation({
    mutationFn: async () => {
      if (!manualForm.professor_id || !manualForm.exam_id || !manualForm.room_id) {
        throw new Error("Please fill all fields");
      }
      return assignDuty(manualForm);
    },
    onSuccess: () => {
      toast.success("Duty assigned successfully");
      setManualAssignOpen(false);
      setManualForm({ professor_id: "", exam_id: "", room_id: "" });
      qc.invalidateQueries({ queryKey: ["professor_duties"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const dropDuty = useMutation({
    mutationFn: removeDuty,
    onSuccess: () => {
      toast.success("Duty removed");
      qc.invalidateQueries({ queryKey: ["professor_duties"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // Professor CRUD
  const save = useMutation({
    mutationFn: async () => {
      if (!form.employee_id || !form.name || !form.department || !form.email) {
        throw new Error("Employee ID, Name, Department and Email are required");
      }
      return editing
        ? updateProfessor(editing.id, { ...form, max_duties: Number(form.max_duties) })
        : createProfessor({ ...form, max_duties: Number(form.max_duties), is_active: true });
    },
    onSuccess: () => {
      toast.success(editing ? "Professor updated" : "Professor added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["professors"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteProfessor,
    onSuccess: () => {
      toast.success("Professor removed");
      qc.invalidateQueries({ queryKey: ["professors"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // Leave Approval Mutations
  const approveLeaveMut = useMutation({
    mutationFn: approveLeave,
    onSuccess: (res) => {
      if (res.unassignedDuties > 0) {
        toast.success(`Leave approved! ${res.unassignedDuties} conflicting duty was automatically unassigned.`);
      } else {
        toast.success("Leave approved! Faculty duty schedule updated.");
      }
      qc.invalidateQueries({ queryKey: ["professor_leaves"] });
      qc.invalidateQueries({ queryKey: ["professor_duties"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectLeaveMut = useMutation({
    mutationFn: ({ id, reason }) => rejectLeave(id, reason),
    onSuccess: () => {
      toast.success("Leave request rejected. The professor remains available for exam duties.");
      setRejectDialogItem(null);
      setRejectionReasonInput("");
      qc.invalidateQueries({ queryKey: ["professor_leaves"] });
      qc.invalidateQueries({ queryKey: ["professor_duties"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const revertLeaveMut = useMutation({
    mutationFn: revertLeaveToPending,
    onSuccess: () => {
      toast.success("Leave status reset to Pending.");
      qc.invalidateQueries({ queryKey: ["professor_leaves"] });
      qc.invalidateQueries({ queryKey: ["professor_duties"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLeaveMut = useMutation({
    mutationFn: removeLeave,
    onSuccess: () => {
      toast.success("Leave record removed.");
      qc.invalidateQueries({ queryKey: ["professor_leaves"] });
      qc.invalidateQueries({ queryKey: ["professor_duties"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // Filter professors
  const filtered = professors.filter((p) => {
    const term = (search || "").toLowerCase();
    return (
      (p?.name || "").toLowerCase().includes(term) ||
      (p?.employee_id || "").toLowerCase().includes(term) ||
      (p?.department || "").toLowerCase().includes(term) ||
      (p?.email || "").toLowerCase().includes(term)
    );
  });

  // Calendar Calculations
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  function handlePrevMonth() {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  }

  function handleTodayMonth() {
    const now = new Date();
    setCalYear(now.getFullYear());
    setCalMonth(now.getMonth());
    setSelectedCalendarDate(now.toISOString().split("T")[0]);
  }

  const activeFacultyList = useMemo(() => professors.filter((p) => p.is_active), [professors]);
  const totalActiveCount = activeFacultyList.length;

  const calendarGrid = useMemo(() => {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    // Monday as 0, Sunday as 6
    const firstDayOfWeek = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;

    const leadingEmpty = Array.from({ length: firstDayOfWeek });

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const dObj = new Date(calYear, calMonth, dayNum);
      const dayOfWeek = dObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isSat = dayOfWeek === 6;
      const isSun = dayOfWeek === 0;

      const dayLeaves = leaves.filter((l) => l.leave_date === dateStr);
      const approvedLeaves = dayLeaves.filter((l) => l.approved);
      const pendingLeaves = dayLeaves.filter((l) => !l.approved && !l.reason?.startsWith("[REJECTED]"));
      const rejectedLeaves = dayLeaves.filter((l) => l.reason?.startsWith("[REJECTED]"));

      const dayDuties = duties.filter((d) => d.exams?.exam_date === dateStr);
      const dutyProfIds = new Set(dayDuties.map((d) => d.professor_id));
      const leaveProfIds = new Set(approvedLeaves.map((l) => l.professor_id));

      const freeFaculty = activeFacultyList.filter(
        (p) => !dutyProfIds.has(p.id) && !leaveProfIds.has(p.id)
      );

      return {
        dayNum,
        dateStr,
        isWeekend,
        isSat,
        isSun,
        dayLeaves,
        approvedLeaves,
        pendingLeaves,
        rejectedLeaves,
        dayDuties,
        freeFaculty,
        freeCount: freeFaculty.length,
        dutyCount: dayDuties.length,
        approvedCount: approvedLeaves.length,
        pendingCount: pendingLeaves.length,
      };
    });

    return { leadingEmpty, days };
  }, [calYear, calMonth, leaves, duties, activeFacultyList]);

  // Selected date statistics
  const selectedDateStats = useMemo(() => {
    if (!selectedCalendarDate) return null;
    const selDateObj = new Date(selectedCalendarDate + "T00:00:00");
    const dayOfWeek = selDateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isSat = dayOfWeek === 6;
    const isSun = dayOfWeek === 0;

    const dateLeaves = leaves.filter((l) => l.leave_date === selectedCalendarDate);
    const dateApprovedLeaves = dateLeaves.filter((l) => l.approved);
    const datePendingLeaves = dateLeaves.filter((l) => !l.approved && !l.reason?.startsWith("[REJECTED]"));
    const dateRejectedLeaves = dateLeaves.filter((l) => l.reason?.startsWith("[REJECTED]"));

    const dateDuties = duties.filter((d) => d.exams?.exam_date === selectedCalendarDate);
    const dutyProfIds = new Set(dateDuties.map((d) => d.professor_id));
    const leaveProfIds = new Set(dateApprovedLeaves.map((l) => l.professor_id));

    const freeFaculty = activeFacultyList.filter(
      (p) => !dutyProfIds.has(p.id) && !leaveProfIds.has(p.id)
    );

    return {
      dateStr: selectedCalendarDate,
      dateObj: selDateObj,
      isWeekend,
      isSat,
      isSun,
      dateLeaves,
      dateApprovedLeaves,
      datePendingLeaves,
      dateRejectedLeaves,
      dateDuties,
      freeFaculty,
      freeCount: freeFaculty.length,
      dutyCount: dateDuties.length,
      approvedCount: dateApprovedLeaves.length,
      pendingCount: datePendingLeaves.length,
    };
  }, [selectedCalendarDate, leaves, duties, activeFacultyList]);

  // Leave Records Filter
  const pendingLeavesTotal = leaves.filter((l) => getLeaveStatus(l) === "pending").length;
  const approvedLeavesTotal = leaves.filter((l) => l.approved).length;
  const rejectedLeavesTotal = leaves.filter((l) => l.reason?.startsWith("[REJECTED]")).length;

  const filteredLeaves = useMemo(() => {
    return leaves.filter((l) => {
      if (selectedCalendarDate && l.leave_date !== selectedCalendarDate) {
        return false;
      }
      const st = getLeaveStatus(l);
      if (leaveStatusFilter === "pending" && st !== "pending") return false;
      if (leaveStatusFilter === "approved" && st !== "approved") return false;
      if (leaveStatusFilter === "rejected" && st !== "rejected") return false;
      return true;
    });
  }, [leaves, selectedCalendarDate, leaveStatusFilter]);

  // Excel import for professors
  function handleProfImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        const result = await importProfessorsFromRows(rows);
        setImportResult(result);
        toast.success(`Import done: ${result.created} created, ${result.updated} updated`);
        qc.invalidateQueries({ queryKey: ["professors"] });
      } catch (err) {
        toast.error("Import failed: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  }

  // Excel import for leaves
  function handleLeaveImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { cellDates: true });
        const result = await importLeavesFromRows(rows);
        setLeaveImportResult(result);
        if (result.conflicts.length > 0) {
          toast.warning(`${result.conflicts.length} duty conflict(s) detected — review below`);
        } else {
          toast.success(`Leave import done: ${result.created} dates added`);
        }
        qc.invalidateQueries({ queryKey: ["professor_leaves"] });
      } catch (err) {
        toast.error("Leave import failed: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  }

  // Download templates
  function downloadProfTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Employee ID", "Name", "Department", "Email", "Phone", "Max Duties"],
      ["EMP001", "Dr. Ravi Sharma", "Computer Science", "ravi@university.edu", "9876543210", "10"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Professors");
    XLSX.writeFile(wb, "professor-import-template.xlsx");
  }

  function downloadLeaveTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Employee ID", "Leave Date", "Reason"],
      ["EMP001", "2026-10-29", "Medical leave"],
      ["EMP002", "2026-10-30", "Academic conference"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leaves");
    XLSX.writeFile(wb, "leave-import-template.xlsx");
  }

  return (
    <AdminLayout title="Faculty & Invigilation Management" description="Manage professors, duty allocations, availability calendar, and leave approvals">
      {/* Top Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-2">
        {[
          { key: "list", label: "Faculty Directory" },
          { key: "duties", label: "⚡ Exam Duties Roster" },
          {
            key: "leaves",
            label: (
              <span className="flex items-center gap-1.5">
                <CalendarRange className="size-4" />
                Leaves & Availability
                {pendingLeavesTotal > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white px-2 py-0.2 text-[11px] font-bold animate-pulse">
                    {pendingLeavesTotal}
                  </span>
                )}
              </span>
            ),
          },
          { key: "import", label: "Templates & Import" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* Tab: Professor List                                              */}
      {/* ================================================================ */}
      {tab === "list" && (
        <div className="panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            <Input
              placeholder="Search faculty by name, ID or department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs text-xs"
            />
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadProfTemplate}>
                <Download className="size-3.5" /> Template
              </Button>
              <Button variant="outline" size="sm" onClick={() => profFileRef.current?.click()}>
                <Upload className="size-3.5" /> Import Excel
              </Button>
              <input ref={profFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleProfImport} />
              <Button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }} className="gap-1.5 text-xs">
                <Plus className="size-3.5" /> Add Faculty Member
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Users className="size-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">No professors found.</p>
              <p className="text-xs text-muted-foreground">Add one manually or import faculty roster via Excel.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Employee ID</th>
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Department</th>
                    <th className="px-4 py-2.5 font-medium">Email</th>
                    <th className="px-4 py-2.5 font-medium text-center">Max Duties</th>
                    <th className="px-4 py-2.5 font-medium text-center">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((prof) => (
                    <tr key={prof.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-primary">{prof.employee_id}</td>
                      <td className="px-4 py-2.5 font-medium">{prof.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{prof.department}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{prof.email}</td>
                      <td className="px-4 py-2.5 text-center font-bold">{prof.max_duties}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={prof.is_active ? "default" : "secondary"} className="text-xs">
                          {prof.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditing(prof);
                          setForm({
                            employee_id: prof.employee_id, name: prof.name, department: prof.department,
                            email: prof.email, phone: prof.phone ?? "", max_duties: prof.max_duties,
                          });
                          setOpen(true);
                        }}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove.mutate(prof.id)} disabled={remove.isPending}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Tab: Invigilation Duties                                         */}
      {/* ================================================================ */}
      {tab === "duties" && (
        <div className="space-y-4">
          <div className="panel p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Filter by Exam:</Label>
              <select
                value={examFilter}
                onChange={(e) => setExamFilter(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="all">All Examinations ({duties.length})</option>
                {allExams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} ({ex.exam_date})
                  </option>
                ))}
              </select>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManualAssignOpen(true)}
                className="gap-1.5 text-xs"
              >
                <Plus className="size-3.5" />
                Assign Single Duty
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (allExams.length > 0) setAutoExamId(allExams[0].id);
                  setAutoAssignOpen(true);
                }}
                className="gap-1.5 text-xs bg-primary text-primary-foreground shadow-xs"
              >
                <Sparkles className="size-3.5" />
                ⚡ Auto-Assign Invigilators
              </Button>
            </div>
          </div>

          <div className="panel">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <p className="text-sm font-semibold">
                  Scheduled Invigilation Roster ({duties.length} Assigned)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Professors are assigned to examination halls as per seating plan capacity, excluding approved leaves.
                </p>
              </div>
            </div>

            {loadingDuties ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : duties.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <AlertTriangle className="size-6 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">No duties assigned yet for this selection.</p>
                <p className="text-xs text-muted-foreground">
                  Click &quot;⚡ Auto-Assign Invigilators&quot; above to automatically distribute faculty across exam halls!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Professor</th>
                      <th className="px-4 py-2.5 font-medium">Employee ID</th>
                      <th className="px-4 py-2.5 font-medium">Department</th>
                      <th className="px-4 py-2.5 font-medium">Examination</th>
                      <th className="px-4 py-2.5 font-medium">Date & Session</th>
                      <th className="px-4 py-2.5 font-medium">Assigned Hall</th>
                      <th className="px-4 py-2.5 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {duties.map((duty) => (
                      <tr key={duty.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-semibold text-foreground">
                          {duty.professors?.name || "Professor"}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                          {duty.professors?.employee_id || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {duty.professors?.department || "—"}
                        </td>
                        <td className="px-4 py-2.5 font-medium">
                          {duty.exams?.name || "Term Exam"}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <span className="font-medium text-foreground">{duty.exams?.exam_date || "—"}</span>
                          <span className="text-muted-foreground capitalize block">{duty.exams?.session || "Morning"}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="font-bold text-primary">
                            {duty.rooms?.room_number || "TBA"} ({duty.rooms?.block || "Main"})
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => dropDuty.mutate(duty.id)}
                            disabled={dropDuty.isPending}
                            className="text-destructive hover:bg-destructive/10"
                            title="Remove Duty"
                          >
                            <Trash2 className="size-4" />
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

      {/* ================================================================ */}
      {/* Tab: Leaves & Availability Calendar                              */}
      {/* ================================================================ */}
      {tab === "leaves" && (
        <div className="space-y-6">
          {/* Top Quick Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="panel p-3.5 border-l-4 border-l-primary flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Active Faculty</p>
                <p className="text-2xl font-bold text-foreground mt-0.5">{totalActiveCount}</p>
              </div>
              <Users className="size-6 text-primary/40" />
            </div>

            <div className={`panel p-3.5 border-l-4 ${pendingLeavesTotal > 0 ? "border-l-amber-500 bg-amber-500/5" : "border-l-muted"} flex items-center justify-between`}>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pending Leave Requests</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-2xl font-bold text-amber-600">{pendingLeavesTotal}</p>
                  {pendingLeavesTotal > 0 && (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300 text-[10px] animate-pulse">
                      Action Required
                    </Badge>
                  )}
                </div>
              </div>
              <Clock className="size-6 text-amber-500/40" />
            </div>

            <div className="panel p-3.5 border-l-4 border-l-emerald-500 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Approved Leaves</p>
                <p className="text-2xl font-bold text-emerald-600 mt-0.5">{approvedLeavesTotal}</p>
              </div>
              <CheckCircle className="size-6 text-emerald-500/40" />
            </div>

            <div className="panel p-3.5 border-l-4 border-l-blue-500 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Scheduled Duties</p>
                <p className="text-2xl font-bold text-blue-600 mt-0.5">{duties.length}</p>
              </div>
              <CalendarDays className="size-6 text-blue-500/40" />
            </div>
          </div>

          {/* Conflict Alert (if Excel import caused conflicts) */}
          {leaveImportResult && leaveImportResult.conflicts.length > 0 && (
            <div className="panel border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="size-4 text-amber-600" />
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                  {leaveImportResult.conflicts.length} duty conflict(s) detected
                </p>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                These professors have duties assigned on their requested leave dates. Approving their leave will automatically unassign their duty.
              </p>
            </div>
          )}

          {/* FACULTY AVAILABILITY CALENDAR */}
          <div className="panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarRange className="size-5 text-primary" />
                  <h3 className="text-lg font-bold text-foreground">
                    Faculty Availability &amp; Leave Calendar
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Monitor available faculty before approving leaves or running duty assignments. Saturday &amp; Sunday are non-working holidays.
                </p>
              </div>

              {/* Month Navigation */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePrevMonth} className="h-8 px-2.5">
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="font-bold text-sm min-w-32 text-center text-foreground">
                  {monthNames[calMonth]} {calYear}
                </span>
                <Button variant="outline" size="sm" onClick={handleNextMonth} className="h-8 px-2.5">
                  <ChevronRight className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleTodayMonth} className="h-8 text-xs text-primary font-semibold">
                  Today
                </Button>
              </div>
            </div>

            {/* Calendar Legend */}
            <div className="flex flex-wrap items-center gap-3 text-xs bg-muted/30 p-2.5 rounded-lg border border-border/60">
              <span className="font-semibold text-muted-foreground">Legend:</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <span className="size-2 rounded-full bg-emerald-500 inline-block" /> Free Faculty
              </span>
              <span className="inline-flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                <span className="size-2 rounded-full bg-blue-500 inline-block" /> On Exam Duty
              </span>
              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <span className="size-2 rounded-full bg-amber-500 inline-block animate-pulse" /> Pending Approval
              </span>
              <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                <span className="size-2 rounded-full bg-rose-500 inline-block" /> Approved Leave
              </span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground ml-auto">
                <Coffee className="size-3.5 text-amber-600" />
                <strong>Saturday &amp; Sunday:</strong> Official Weekend Holidays
              </span>
            </div>

            {/* Calendar Grid */}
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                {/* Weekday Header */}
                <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold mb-1.5">
                  <div className="py-1.5 rounded bg-muted/60 text-foreground">Mon</div>
                  <div className="py-1.5 rounded bg-muted/60 text-foreground">Tue</div>
                  <div className="py-1.5 rounded bg-muted/60 text-foreground">Wed</div>
                  <div className="py-1.5 rounded bg-muted/60 text-foreground">Thu</div>
                  <div className="py-1.5 rounded bg-muted/60 text-foreground">Fri</div>
                  <div className="py-1.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300/40">
                    Sat (Holiday)
                  </div>
                  <div className="py-1.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300/40">
                    Sun (Holiday)
                  </div>
                </div>

                {/* Grid Cells */}
                <div className="grid grid-cols-7 gap-1.5">
                  {/* Leading Empty Cells */}
                  {calendarGrid.leadingEmpty.map((_, idx) => (
                    <div key={`empty-${idx}`} className="h-28 rounded-lg bg-muted/10 border border-transparent" />
                  ))}

                  {/* Days */}
                  {calendarGrid.days.map((cell) => {
                    const isSelected = selectedCalendarDate === cell.dateStr;
                    const isToday = cell.dateStr === new Date().toISOString().split("T")[0];

                    return (
                      <div
                        key={cell.dateStr}
                        onClick={() => setSelectedCalendarDate((prev) => (prev === cell.dateStr ? null : cell.dateStr))}
                        className={`h-28 p-2 rounded-lg border transition-all cursor-pointer flex flex-col justify-between select-none ${
                          cell.isWeekend
                            ? "bg-muted/20 border-border/40 hover:border-amber-400/60"
                            : "bg-card border-border/80 hover:border-primary/70 hover:shadow-xs"
                        } ${
                          isSelected
                            ? "ring-2 ring-primary border-primary bg-primary/5 shadow-sm"
                            : ""
                        }`}
                      >
                        {/* Cell Top: Day Number + Tags */}
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${
                            cell.isWeekend ? "text-amber-700 dark:text-amber-400" : isToday ? "text-primary" : "text-foreground"
                          }`}>
                            {cell.dayNum}
                          </span>
                          {isToday && (
                            <span className="text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.2 rounded-full">
                              Today
                            </span>
                          )}
                          {cell.isWeekend && (
                            <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-0.5">
                              <Coffee className="size-2.5" /> Off
                            </span>
                          )}
                        </div>

                        {/* Cell Body: Weekend vs Working Day */}
                        {cell.isWeekend ? (
                          <div className="my-auto text-center space-y-0.5">
                            <span className="inline-block text-[10px] font-medium text-muted-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded">
                              Weekend Holiday
                            </span>
                            <p className="text-[9px] text-muted-foreground/60">No exam duty</p>
                          </div>
                        ) : (
                          <div className="space-y-1 my-1">
                            {/* Free Faculty Badge */}
                            <div className="flex items-center justify-between text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-semibold">
                              <span>Free:</span>
                              <span>{cell.freeCount}</span>
                            </div>

                            {/* Duties Badge */}
                            {cell.dutyCount > 0 && (
                              <div className="flex items-center justify-between text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                                <span>Duty:</span>
                                <span>{cell.dutyCount}</span>
                              </div>
                            )}

                            {/* Approved Leave Badge */}
                            {cell.approvedCount > 0 && (
                              <div className="flex items-center justify-between text-[10px] bg-rose-500/10 text-rose-700 dark:text-rose-400 px-1.5 py-0.5 rounded font-medium">
                                <span>Leave:</span>
                                <span>{cell.approvedCount}</span>
                              </div>
                            )}

                            {/* Pending Leave Badge (Pulsing Amber) */}
                            {cell.pendingCount > 0 && (
                              <div className="flex items-center justify-between text-[10px] bg-amber-500/15 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded font-bold border border-amber-300/60 animate-pulse">
                                <span>Pending:</span>
                                <span>{cell.pendingCount}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Cell Bottom Indicator */}
                        <div className="text-[9px] text-muted-foreground truncate">
                          {isSelected ? "✓ Selected" : "Click to view"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* SELECTED DATE DETAILS & PENDING ACTION BANNER */}
          {selectedDateStats && (
            <div className="panel p-5 space-y-4 border-2 border-primary/40 bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-5 text-primary" />
                  <div>
                    <h4 className="font-bold text-base text-foreground">
                      Schedule &amp; Availability:{" "}
                      <span className="text-primary font-mono">{selectedDateStats.dateStr}</span>{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({selectedDateStats.dateObj.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })})
                      </span>
                    </h4>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCalendarDate(null)}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5 mr-1" /> Clear Date Filter
                </Button>
              </div>

              {selectedDateStats.isWeekend ? (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-200 dark:border-amber-900/40 flex items-center gap-3">
                  <Coffee className="size-8 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-bold text-sm text-amber-800 dark:text-amber-300">
                      Official Weekend Holiday ({selectedDateStats.isSat ? "Saturday" : "Sunday"})
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      University exams and regular invigilation duties are not conducted on weekends. Faculty members have scheduled weekly off.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Working Day Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="bg-emerald-500/10 border border-emerald-200 dark:border-emerald-900/40 p-2.5 rounded-lg">
                      <span className="text-muted-foreground block text-[11px]">Available Faculty</span>
                      <strong className="text-lg text-emerald-700 dark:text-emerald-400">{selectedDateStats.freeCount} Professors</strong>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-200 dark:border-blue-900/40 p-2.5 rounded-lg">
                      <span className="text-muted-foreground block text-[11px]">Assigned to Duties</span>
                      <strong className="text-lg text-blue-700 dark:text-blue-400">{selectedDateStats.dutyCount} Duties</strong>
                    </div>
                    <div className="bg-rose-500/10 border border-rose-200 dark:border-rose-900/40 p-2.5 rounded-lg">
                      <span className="text-muted-foreground block text-[11px]">Approved On Leave</span>
                      <strong className="text-lg text-rose-700 dark:text-rose-400">{selectedDateStats.approvedCount} On Leave</strong>
                    </div>
                    <div className={`p-2.5 rounded-lg border ${selectedDateStats.pendingCount > 0 ? "bg-amber-500/15 border-amber-400" : "bg-muted/40 border-border"}`}>
                      <span className="text-muted-foreground block text-[11px]">Pending Approval</span>
                      <strong className={`text-lg ${selectedDateStats.pendingCount > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                        {selectedDateStats.pendingCount} Requests
                      </strong>
                    </div>
                  </div>

                  {/* PENDING LEAVE REQUESTS ACTION SECTION */}
                  {selectedDateStats.datePendingLeaves.length > 0 && (
                    <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="size-4 text-amber-600" />
                        <h5 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                          Pending Leave Approval Requests for {selectedDateStats.dateStr}
                        </h5>
                      </div>
                      <div className="divide-y divide-amber-200/60 dark:divide-amber-900/40">
                        {selectedDateStats.datePendingLeaves.map((leave) => (
                          <div key={leave.id} className="pt-2 pb-2 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-bold text-sm text-foreground">
                                {leave.professors?.name || "Professor"}
                                <span className="ml-2 font-mono text-xs text-muted-foreground font-normal">
                                  ({leave.professors?.employee_id})
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Reason: <strong className="text-foreground">{getCleanReason(leave.reason)}</strong>
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => approveLeaveMut.mutate(leave.id)}
                                disabled={approveLeaveMut.isPending}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs h-8"
                              >
                                {approveLeaveMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                                Approve Leave
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setRejectDialogItem(leave);
                                  setRejectionReasonInput("");
                                }}
                                disabled={rejectLeaveMut.isPending}
                                className="gap-1 text-xs h-8"
                              >
                                <X className="size-3.5" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Toggle Faculty Availability Roster for this Day */}
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-muted-foreground">
                      {selectedDateStats.freeCount} faculty available for assignment on {selectedDateStats.dateStr}.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDayFacultyRoster(!showDayFacultyRoster)}
                      className="text-xs h-7"
                    >
                      {showDayFacultyRoster ? "Hide Faculty Roster" : "View Day Faculty Roster"}
                    </Button>
                  </div>

                  {showDayFacultyRoster && (
                    <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs space-y-3">
                      <div>
                        <p className="font-bold text-foreground mb-1">🟢 Available Faculty ({selectedDateStats.freeCount})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedDateStats.freeFaculty.map((p) => (
                            <span key={p.id} className="bg-background px-2 py-1 rounded border border-border text-[11px]">
                              {p.name} <span className="text-muted-foreground font-mono">({p.employee_id})</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      {selectedDateStats.dutyCount > 0 && (
                        <div>
                          <p className="font-bold text-blue-700 dark:text-blue-400 mb-1">📘 Assigned to Exam Duties ({selectedDateStats.dutyCount})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedDateStats.dateDuties.map((d) => (
                              <span key={d.id} className="bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded border border-blue-200 dark:border-blue-800 text-[11px]">
                                {d.professors?.name} → {d.rooms ? `${d.rooms.block}/${d.rooms.room_number}` : "Room"} ({d.exams?.name || "Exam"})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedDateStats.approvedCount > 0 && (
                        <div>
                          <p className="font-bold text-rose-700 dark:text-rose-400 mb-1">🔴 On Approved Leave ({selectedDateStats.approvedCount})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedDateStats.dateApprovedLeaves.map((l) => (
                              <span key={l.id} className="bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 px-2 py-1 rounded border border-rose-200 dark:border-rose-800 text-[11px]">
                                {l.professors?.name} ({getCleanReason(l.reason)})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* LEAVE RECORDS & APPROVAL TABLE */}
          <div className="panel space-y-4">
            <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-base text-foreground flex items-center gap-2">
                  <Clock className="size-4 text-primary" /> Faculty Leave Applications &amp; Records
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Approve or reject leave applications submitted by professors. Approved leaves automatically prevent duty assignments.
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border">
                {[
                  { key: "all", label: `All (${leaves.length})` },
                  { key: "pending", label: `Pending (${pendingLeavesTotal})` },
                  { key: "approved", label: `Approved (${approvedLeavesTotal})` },
                  { key: "rejected", label: `Rejected (${rejectedLeavesTotal})` },
                ].map((st) => (
                  <button
                    key={st.key}
                    onClick={() => setLeaveStatusFilter(st.key)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      leaveStatusFilter === st.key
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedCalendarDate && (
              <div className="px-4 py-2 bg-primary/5 border-b border-border text-xs flex items-center justify-between">
                <span className="font-medium text-foreground">
                  Filtered by Calendar Date: <strong className="font-mono text-primary">{selectedCalendarDate}</strong>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCalendarDate(null)}
                  className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear Date Filter
                </Button>
              </div>
            )}

            {filteredLeaves.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <CheckCircle2 className="size-7 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">No leave records match this selection.</p>
                <p className="text-xs text-muted-foreground">
                  {selectedCalendarDate ? "No leaves filed for this specific date." : "No leave requests currently in this filter."}
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
                      <th className="px-4 py-2.5 font-medium">Leave Date</th>
                      <th className="px-4 py-2.5 font-medium">Reason Stated</th>
                      <th className="px-4 py-2.5 font-medium text-center">Approval Status</th>
                      <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredLeaves.map((l) => {
                      const status = getLeaveStatus(l);
                      const isPending = status === "pending";
                      const isApproved = status === "approved";
                      const isRejected = status === "rejected";

                      return (
                        <tr key={l.id} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-semibold text-foreground">
                            {l.professors?.name ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                            {l.professors?.employee_id ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {l.professors?.department ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-foreground">
                            {l.leave_date}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-foreground max-w-xs">
                            {getCleanReason(l.reason)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {isApproved && (
                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 text-xs gap-1">
                                <Check className="size-3" /> Approved
                              </Badge>
                            )}
                            {isRejected && (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <X className="size-3" /> Rejected
                              </Badge>
                            )}
                            {isPending && (
                              <Badge variant="outline" className="text-amber-700 dark:text-amber-300 border-amber-400 bg-amber-500/10 text-xs gap-1 animate-pulse">
                                <Clock className="size-3" /> Pending Approval
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {isPending && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => approveLeaveMut.mutate(l.id)}
                                    disabled={approveLeaveMut.isPending}
                                    className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                    title="Approve Leave"
                                  >
                                    <Check className="size-3" /> Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => {
                                      setRejectDialogItem(l);
                                      setRejectionReasonInput("");
                                    }}
                                    disabled={rejectLeaveMut.isPending}
                                    className="h-7 px-2.5 text-xs gap-1"
                                    title="Reject Leave"
                                  >
                                    <X className="size-3" /> Reject
                                  </Button>
                                </>
                              )}

                              {isApproved && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => revertLeaveMut.mutate(l.id)}
                                  disabled={revertLeaveMut.isPending}
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                                  title="Revoke Approval to Pending"
                                >
                                  <RotateCcw className="size-3" /> Revoke
                                </Button>
                              )}

                              {isRejected && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => revertLeaveMut.mutate(l.id)}
                                  disabled={revertLeaveMut.isPending}
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                                  title="Re-open Leave Request"
                                >
                                  <RotateCcw className="size-3" /> Re-open
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteLeaveMut.mutate(l.id)}
                                disabled={deleteLeaveMut.isPending}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Delete Leave Record"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Excel Leave Import/Export Panel */}
          <div className="panel p-4 flex flex-wrap gap-2 items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Bulk Faculty Leave Upload (Excel)</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload institutional faculty leave calendars in bulk.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadLeaveTemplate}>
                <Download className="size-3.5" /> Template
              </Button>
              <Button variant="outline" size="sm" onClick={() => leaveFileRef.current?.click()}>
                <Upload className="size-3.5" /> Import Leaves
              </Button>
              <input ref={leaveFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleLeaveImport} />
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Tab: Templates & Import Format                                   */}
      {/* ================================================================ */}
      {tab === "import" && (
        <div className="space-y-4">
          <div className="panel p-6 space-y-4">
            <h3 className="font-semibold">Professor Import Format</h3>
            <p className="text-sm text-muted-foreground">Download the template and fill in your data. Required columns:</p>
            <div className="overflow-x-auto">
              <table className="text-sm border border-border rounded">
                <thead className="bg-muted/60">
                  <tr>
                    {["Employee ID*", "Name*", "Department*", "Email*", "Phone", "Max Duties"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    {["EMP001", "Dr. Ravi Sharma", "Computer Science", "ravi@univ.edu", "9876543210", "10"].map((v, i) => (
                      <td key={i} className="px-3 py-2 text-muted-foreground font-mono text-xs">{v}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <Button onClick={downloadProfTemplate}><Download className="size-4" /> Download Professor Template</Button>

            <hr className="border-border" />

            <h3 className="font-semibold mt-4">Leave Import Format</h3>
            <p className="text-sm text-muted-foreground">Upload a leave sheet so the system knows who is unavailable. Required columns:</p>
            <div className="overflow-x-auto">
              <table className="text-sm border border-border rounded">
                <thead className="bg-muted/60">
                  <tr>
                    {["Employee ID*", "Leave Date*", "Reason"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    {["EMP001", "2026-10-29", "Medical leave"].map((v, i) => (
                      <td key={i} className="px-3 py-2 text-muted-foreground font-mono text-xs">{v}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <Button onClick={downloadLeaveTemplate}><Download className="size-4" /> Download Leave Template</Button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Dialogs                                                          */}
      {/* ================================================================ */}

      {/* Add/Edit Professor Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Faculty Member" : "Add Faculty Member"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Employee ID *</Label>
              <Input value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} placeholder="EMP001" />
            </div>
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. Ravi Sharma" />
            </div>
            <div className="space-y-2">
              <Label>Department *</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Computer Science" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ravi@university.edu" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" />
            </div>
            <div className="space-y-2">
              <Label>Max Duty Allocations</Label>
              <Input type="number" min="1" max="100" value={form.max_duties} onChange={(e) => setForm({ ...form, max_duties: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing ? "Update" : "Add"} Faculty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Assign Dialog */}
      <Dialog open={autoAssignOpen} onOpenChange={setAutoAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Auto-Assign Invigilators as per Seating Plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              This engine assigns invigilators strictly to examination halls used in the seating plan.
              Professors on approved leave on this exam date or exceeding their duty quotas are automatically skipped.
            </p>

            <div className="space-y-2">
              <Label className="text-xs">Select Examination *</Label>
              <select
                value={autoExamId}
                onChange={(e) => setAutoExamId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {allExams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} — {ex.exam_date} ({ex.session})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Professors Per Examination Hall</Label>
              <select
                value={autoProfPerRoom}
                onChange={(e) => setAutoProfPerRoom(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value={1}>1 Invigilator per Hall</option>
                <option value={2}>2 Invigilators per Hall (Large Rooms)</option>
                <option value={3}>3 Invigilators per Hall</option>
              </select>
            </div>

            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-primary" /> Total Active Faculty: {totalActiveCount}
              </p>
              <p className="text-muted-foreground">
                Duty assignments strictly honor approved leaves and duty quotas.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAutoAssignOpen(false)}>Cancel</Button>
            <Button onClick={() => autoAssign.mutate()} disabled={autoAssign.isPending}>
              {autoAssign.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Sparkles className="size-4 mr-1.5" />}
              Run Auto-Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Assign Dialog */}
      <Dialog open={manualAssignOpen} onOpenChange={setManualAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Single Invigilation Duty</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Select Professor *</Label>
              <select
                value={manualForm.professor_id}
                onChange={(e) => setManualForm({ ...manualForm, professor_id: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">-- Choose Professor --</option>
                {professors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.employee_id}) - {p.department}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Select Examination *</Label>
              <select
                value={manualForm.exam_id}
                onChange={(e) => setManualForm({ ...manualForm, exam_id: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">-- Choose Exam --</option>
                {allExams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} — {ex.exam_date} ({ex.session})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Select Examination Hall *</Label>
              <select
                value={manualForm.room_id}
                onChange={(e) => setManualForm({ ...manualForm, room_id: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">-- Choose Room --</option>
                {allRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.room_number} ({r.block}) — Capacity: {r.capacity}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualAssignOpen(false)}>Cancel</Button>
            <Button onClick={() => manualAssign.mutate()} disabled={manualAssign.isPending}>
              {manualAssign.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
              Assign Duty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Leave Confirmation Dialog */}
      <Dialog open={!!rejectDialogItem} onOpenChange={(v) => !v && setRejectDialogItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <XCircle className="size-5" /> Reject Faculty Leave Request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              Are you sure you want to reject this leave application? The faculty member will remain available for exam duty assignment on this date.
            </p>
            <div className="p-3 bg-muted/40 rounded-lg space-y-1">
              <p><strong>Faculty:</strong> {rejectDialogItem?.professors?.name} ({rejectDialogItem?.professors?.employee_id})</p>
              <p><strong>Requested Date:</strong> {rejectDialogItem?.leave_date}</p>
              <p><strong>Reason:</strong> {getCleanReason(rejectDialogItem?.reason)}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rejection Note (Optional):</Label>
              <Input
                placeholder="e.g. Critical examination duties scheduled"
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogItem(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectDialogItem) {
                  rejectLeaveMut.mutate({ id: rejectDialogItem.id, reason: rejectionReasonInput });
                }
              }}
              disabled={rejectLeaveMut.isPending}
            >
              {rejectLeaveMut.isPending ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
