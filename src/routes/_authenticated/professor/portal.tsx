import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Users,
  Calendar,
  Clock,
  MapPin,
  CheckCircle,
  FileCheck,
  Send,
  CalendarDays,
  FileSpreadsheet,
  AlertCircle,
  Check,
  X,
  Loader2,
  Sparkles,
  Briefcase,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { UNIVERSITY_NAME } from "@/lib/db";
import { ProfessorLayout, type ProfessorNavTab } from "@/components/layout/ProfessorLayout";
import { GridBackdrop } from "@/components/effects/GridBackdrop";

export const Route = createFileRoute("/_authenticated/professor/portal")({
  head: () => ({
    meta: [{ title: "Faculty & Invigilator Portal | " + UNIVERSITY_NAME }],
  }),
  component: ProfessorPortalPage,
});

type ProfessorProfile = {
  id: string;
  name: string;
  employee_id: string;
  department: string;
  email: string;
  phone: string | null;
  max_duties: number;
};

type InvigilationDuty = {
  id: string;
  exam_id: string;
  exam_name: string;
  exam_date: string;
  session: string;
  room_id: string;
  room_number: string;
  block: string;
  capacity: number;
};

type LeaveRequest = {
  id: string;
  leave_date: string;
  reason: string | null;
  approved: boolean;
  created_at: string;
};

type RoomStudent = {
  student_id: string;
  name: string;
  registration_number: string;
  roll_number: string | null;
  row_number: number;
  seat_number: number;
  present?: boolean;
};

function ProfessorPortalPage() {
  const { user } = useAuth();

  const [professor, setProfessor] = useState<ProfessorProfile | null>(null);
  const [duties, setDuties] = useState<InvigilationDuty[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfessorNavTab>("duties");

  // Room Students Modal
  const [selectedDuty, setSelectedDuty] = useState<InvigilationDuty | null>(null);
  const [roomStudents, setRoomStudents] = useState<RoomStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // New Leave Form
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [submittingLeave, setSubmittingLeave] = useState(false);

  useEffect(() => {
    async function loadProfessorData() {
      if (!user) return;
      setLoading(true);
      try {
        // 1. Fetch professor linked to user or fallback to first professor
        let { data: profRec } = await supabase
          .from("professors")
          .select("id, name, employee_id, department, email, phone, max_duties")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!profRec) {
          const { data: firstProf } = await supabase
            .from("professors")
            .select("id, name, employee_id, department, email, phone, max_duties")
            .limit(1)
            .maybeSingle();
          profRec = firstProf;
        }

        if (profRec) {
          setProfessor(profRec as any);

          // 2. Fetch assigned duties
          const { data: dutyData } = await supabase
            .from("professor_duties")
            .select(`
              id,
              exam_id,
              room_id,
              room:rooms(id, room_number, block, capacity),
              exam:exams(id, name, exam_date, session)
            `)
            .eq("professor_id", profRec.id);

          if (dutyData) {
            const formatted: InvigilationDuty[] = dutyData.map((d: any) => ({
              id: d.id,
              exam_id: d.exam?.id || "",
              exam_name: d.exam?.name || "Examination",
              exam_date: d.exam?.exam_date || "",
              session: d.exam?.session || "morning",
              room_id: d.room?.id || "",
              room_number: d.room?.room_number || "TBA",
              block: d.room?.block || "Main",
              capacity: d.room?.capacity || 30,
            }));
            setDuties(formatted);
          }

          // 3. Fetch leaves
          const { data: leaveData } = await supabase
            .from("professor_leaves")
            .select("id, leave_date, reason, approved, created_at")
            .eq("professor_id", profRec.id)
            .order("leave_date", { ascending: false });

          if (leaveData) {
            setLeaves(leaveData as LeaveRequest[]);
          }
        }
      } catch (err) {
        console.error("Error loading professor portal data:", err);
      } finally {
        setLoading(false);
      }
    }

    void loadProfessorData();
  }, [user]);

  // Open Room Students Sheet
  async function handleOpenRoomSheet(duty: InvigilationDuty) {
    setSelectedDuty(duty);
    setLoadingStudents(true);
    try {
      const { data: plan } = await supabase
        .from("seating_plans")
        .select("id")
        .eq("exam_id", duty.exam_id)
        .maybeSingle();

      if (!plan) {
        setRoomStudents([]);
        return;
      }

      const { data: allocations } = await supabase
        .from("seat_allocations")
        .select(`
          row_number,
          seat_number,
          student:students(id, name, registration_number, roll_number)
        `)
        .eq("plan_id", plan.id)
        .eq("room_id", duty.room_id)
        .order("row_number", { ascending: true })
        .order("seat_number", { ascending: true });

      if (allocations) {
        const list: RoomStudent[] = allocations.map((a: any) => ({
          student_id: a.student?.id,
          name: a.student?.name || "Student",
          registration_number: a.student?.registration_number || "—",
          roll_number: a.student?.roll_number || null,
          row_number: a.row_number,
          seat_number: a.seat_number,
          present: true,
        }));
        setRoomStudents(list);
      }
    } catch (err) {
      toast.error("Failed to load room seating list");
    } finally {
      setLoadingStudents(false);
    }
  }

  function toggleAttendance(studentId: string) {
    setRoomStudents((prev) =>
      prev.map((s) => (s.student_id === studentId ? { ...s, present: !s.present } : s)),
    );
  }

  // Handle Apply Leave
  async function handleApplyLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!professor) return;
    if (!leaveDate) {
      toast.error("Please select a date");
      return;
    }

    setSubmittingLeave(true);
    try {
      const { data, error } = await supabase
        .from("professor_leaves")
        .insert({
          professor_id: professor.id,
          leave_date: leaveDate,
          reason: leaveReason.trim() || null,
          approved: false,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Leave request submitted to Examination Office");
      setLeaves((prev) => [data as LeaveRequest, ...prev]);
      setLeaveDate("");
      setLeaveReason("");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit leave request");
    } finally {
      setSubmittingLeave(false);
    }
  }

  return (
    <ProfessorLayout
      title="Faculty & Invigilation Console"
      description="Manage exam duties, student room attendance, and faculty leave requests"
      activeTab={activeTab}
      onTabChange={setActiveTab}
      professorInfo={{
        name: professor?.name,
        employeeId: professor?.employee_id,
        department: professor?.department,
        email: professor?.email,
        maxDuties: professor?.max_duties,
        assignedDutiesCount: duties.length,
      }}
    >
      {/* Emerald Hero Welcome Banner */}
      <div className="surface-emerald relative mb-6 overflow-hidden rounded-xl p-6 text-white shadow-md">
        <GridBackdrop />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-semibold text-gold">
                Faculty Invigilation Console
              </span>
              <p className="text-xs font-medium text-white/70">
                {UNIVERSITY_NAME} · Examination Branch
              </p>
            </div>

            <h2 className="mt-2 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome, {professor?.name || "Professor"}!
            </h2>

            <p className="mt-2 max-w-xl text-sm text-white/80">
              Employee ID:{" "}
              <span className="font-mono font-bold text-gold">
                {professor?.employee_id || "—"}
              </span>{" "}
              • {professor?.department || "Academic Department"} • Max Duty Allocation:{" "}
              <span className="font-bold text-white">{professor?.max_duties || 10} exams</span>
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={activeTab === "duties" ? "secondary" : "outline"}
                onClick={() => setActiveTab("duties")}
                className={
                  activeTab === "duties"
                    ? ""
                    : "border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                }
              >
                <CalendarDays className="size-3.5 mr-1.5" /> Assigned Duties ({duties.length})
              </Button>
              <Button
                size="sm"
                variant={activeTab === "leaves" ? "secondary" : "outline"}
                onClick={() => setActiveTab("leaves")}
                className={
                  activeTab === "leaves"
                    ? ""
                    : "border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                }
              >
                <Calendar className="size-3.5 mr-1.5" /> Leave Requests ({leaves.length})
              </Button>
              <Button
                size="sm"
                variant={activeTab === "guidelines" ? "secondary" : "outline"}
                onClick={() => setActiveTab("guidelines")}
                className={
                  activeTab === "guidelines"
                    ? ""
                    : "border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                }
              >
                <ShieldCheck className="size-3.5 mr-1.5" /> Invigilator Guidelines
              </Button>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 text-right">
            {[
              { label: "Duties", value: `${duties.length} / ${professor?.max_duties || 10}` },
              { label: "Duty Load", value: `${Math.round((duties.length / (professor?.max_duties || 10)) * 100)}%` },
              { label: "Leaves", value: leaves.length },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-black/20 p-3 backdrop-blur-xs">
                <dt className="text-xs font-medium uppercase tracking-wide text-white/70">
                  {item.label}
                </dt>
                <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-gold">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <span className="gold-rule absolute inset-x-0 bottom-0 h-0.5" />
      </div>

      {/* Tab 1: Invigilation Duties */}
      {activeTab === "duties" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" /> Upcoming Invigilation Duties
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Official examination halls, session timings, and student seating rosters assigned to you.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-44 w-full rounded-xl" />
            </div>
          ) : duties.length === 0 ? (
            <div className="panel p-10 text-center space-y-2">
              <AlertCircle className="size-8 mx-auto text-muted-foreground" />
              <p className="font-semibold text-sm text-foreground">No invigilation duties scheduled currently.</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Duties will appear automatically once the examination office runs the 1-click auto-assignment engine or assigns your hall duty manually.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {duties.map((duty) => (
                <div
                  key={duty.id}
                  className="panel group relative p-5 space-y-4 hover:border-primary/50 transition-all shadow-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <Badge
                        variant="secondary"
                        className="mb-1 text-[10px] uppercase font-bold tracking-wider"
                      >
                        {duty.session === "morning" ? "Morning Session" : "Evening Session"}
                      </Badge>
                      <h4 className="font-bold text-base text-foreground">{duty.exam_name}</h4>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <Calendar className="size-3.5 text-primary" />
                          {duty.exam_date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3.5 text-primary" />
                          {duty.session === "morning"
                            ? "09:30 AM - 12:30 PM"
                            : "01:30 PM - 04:30 PM"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/40 border border-border/50 p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <MapPin className="size-3 text-primary" /> Assigned Hall
                      </span>
                      <p className="text-xl font-bold text-foreground">
                        {duty.room_number}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({duty.block})
                        </span>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Hall Capacity
                      </span>
                      <p className="text-base font-bold text-foreground">{duty.capacity} Students</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Report to control room by{" "}
                      <strong className="text-foreground">
                        {duty.session === "morning" ? "08:45 AM" : "12:45 PM"}
                      </strong>
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleOpenRoomSheet(duty)}
                      className="gap-2 text-xs"
                    >
                      <FileSpreadsheet className="size-3.5" />
                      Room Seating & Attendance
                    </Button>
                  </div>
                  <span className="gold-rule absolute inset-x-0 bottom-0 h-0.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Leaves Management */}
      {activeTab === "leaves" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Apply Leave Form */}
          <div className="panel p-5 space-y-4">
            <div>
              <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                <Calendar className="size-4 text-primary" /> Request Exam Duty Leave
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Apply in advance so the auto-assignment engine excludes you on this exam date.
              </p>
            </div>

            <form onSubmit={handleApplyLeave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="leaveDate" className="text-xs">
                  Leave Date *
                </Label>
                <Input
                  id="leaveDate"
                  type="date"
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="leaveReason" className="text-xs">
                  Reason for Leave
                </Label>
                <Input
                  id="leaveReason"
                  placeholder="Medical, Academic Conference, Family event, etc."
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                />
              </div>

              <Button type="submit" disabled={submittingLeave} className="w-full gap-2">
                {submittingLeave ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                Submit Leave Request
              </Button>
            </form>
          </div>

          {/* Past Leaves List */}
          <div className="panel md:col-span-2 p-5 space-y-4">
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <FileCheck className="size-4 text-primary" /> Leave History & Approval Status
            </h3>
            {leaves.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No leave requests filed yet.
              </div>
            ) : (
              <div className="border border-border rounded-md overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-muted border-b border-border font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Reason</th>
                      <th className="p-2.5">Applied On</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {leaves.map((l) => (
                      <tr key={l.id} className="hover:bg-muted/30">
                        <td className="p-2.5 font-bold text-foreground">{l.leave_date}</td>
                        <td className="p-2.5">
                          {l.reason?.startsWith("[REJECTED]") ? (
                            <div>
                              <span className="text-foreground">{l.reason.replace(/^\[REJECTED\]\s*/, "") || "Personal Leave"}</span>
                              <span className="block text-[10px] text-destructive font-semibold mt-0.5">Application declined by Examination Office</span>
                            </div>
                          ) : (
                            l.reason || "Personal Leave"
                          )}
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          {new Date(l.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-2.5 text-center">
                          {l.approved ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
                              Approved
                            </Badge>
                          ) : l.reason?.startsWith("[REJECTED]") ? (
                            <Badge variant="destructive">
                              Rejected
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-600 border-amber-300">
                              Pending
                            </Badge>
                          )}
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

      {/* Tab 3: Guidelines */}
      {activeTab === "guidelines" && (
        <div className="panel p-6 space-y-4">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Standard Operating Procedure for Invigilators
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-2">
              <h4 className="font-bold text-sm text-primary flex items-center gap-1.5">
                <CheckCircle className="size-4" /> Before Examination
              </h4>
              <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground">
                <li>Report to the Examination Control Room at least 45 minutes prior to session start.</li>
                <li>Collect question paper packets, answer sheets, and room seating chart.</li>
                <li>Inspect the examination hall for any unauthorized study material.</li>
                <li>Ensure students enter with only permissible stationery and verified Admit Cards.</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg border border-border bg-muted/20 space-y-2">
              <h4 className="font-bold text-sm text-primary flex items-center gap-1.5">
                <CheckCircle className="size-4" /> During & After Examination
              </h4>
              <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground">
                <li>Mark student attendance accurately on the room attendance sheet.</li>
                <li>Verify student identity and ensure their signature matches the admit card.</li>
                <li>Collect answer scripts sequentially by roll number before letting candidates leave.</li>
                <li>Submit all answer booklets and unused question papers immediately to the control room.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Room Attendance Modal */}
      <Dialog open={!!selectedDuty} onOpenChange={() => setSelectedDuty(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div>
                <span>Room {selectedDuty?.room_number} Attendance & Seating</span>
                <p className="text-xs font-normal text-muted-foreground mt-0.5">
                  {selectedDuty?.exam_name} • {selectedDuty?.exam_date} ({selectedDuty?.session})
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          {loadingStudents ? (
            <div className="py-10 text-center">
              <Loader2 className="size-6 animate-spin mx-auto text-primary" />
              <p className="text-xs text-muted-foreground mt-2">Loading student allocations...</p>
            </div>
          ) : roomStudents.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No students allocated to this room yet. Seating plans can be generated from the Admin Seating Engine.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs bg-muted/40 p-2.5 rounded-lg border border-border">
                <span>
                  Total Seated: <strong>{roomStudents.length}</strong>
                </span>
                <span>
                  Present:{" "}
                  <strong className="text-emerald-600">
                    {roomStudents.filter((s) => s.present).length}
                  </strong>
                </span>
                <span>
                  Absent:{" "}
                  <strong className="text-destructive">
                    {roomStudents.filter((s) => !s.present).length}
                  </strong>
                </span>
              </div>

              <div className="border border-border rounded-md overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-muted border-b border-border font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-2.5 text-center">Seat</th>
                      <th className="p-2.5">Student Name</th>
                      <th className="p-2.5 font-mono">Reg No</th>
                      <th className="p-2.5 font-mono">Roll No</th>
                      <th className="p-2.5 text-center">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {roomStudents.map((st) => (
                      <tr
                        key={st.student_id}
                        className={st.present ? "hover:bg-muted/30" : "bg-destructive/5"}
                      >
                        <td className="p-2.5 text-center font-bold">
                          <span className="bg-muted px-2 py-0.5 rounded text-[11px]">
                            R{st.row_number}-S{st.seat_number}
                          </span>
                        </td>
                        <td className="p-2.5 font-medium text-foreground">{st.name}</td>
                        <td className="p-2.5 font-mono">{st.registration_number}</td>
                        <td className="p-2.5 font-mono text-muted-foreground">
                          {st.roll_number || "—"}
                        </td>
                        <td className="p-2.5 text-center">
                          <Button
                            size="sm"
                            variant={st.present ? "default" : "destructive"}
                            className="h-7 text-xs px-2.5 gap-1"
                            onClick={() => toggleAttendance(st.student_id)}
                          >
                            {st.present ? (
                              <>
                                <Check className="size-3" /> Present
                              </>
                            ) : (
                              <>
                                <X className="size-3" /> Absent
                              </>
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ProfessorLayout>
  );
}
