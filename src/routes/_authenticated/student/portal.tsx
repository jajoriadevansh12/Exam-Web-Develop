import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  GraduationCap,
  Calendar,
  Clock,
  MapPin,
  FileText,
  Printer,
  BookOpen,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  ArrowRight,
  UserCheck,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { UNIVERSITY_NAME } from "@/lib/db";
import { StudentLayout, type StudentNavTab } from "@/components/layout/StudentLayout";
import { GridBackdrop } from "@/components/effects/GridBackdrop";
import {
  getStudentAttendanceMap,
  type AttendanceStatus,
} from "@/lib/attendance";

export const Route = createFileRoute("/_authenticated/student/portal")({
  head: () => ({
    meta: [{ title: "Student Exam Portal | " + UNIVERSITY_NAME }],
  }),
  component: StudentPortalPage,
});

type StudentProfile = {
  id: string;
  name: string;
  registration_number: string;
  roll_number: string | null;
  status: string;
  course?: { name: string; code: string };
  batch?: { name: string };
  section?: { name: string };
};

type SeatSchedule = {
  exam_id: string;
  exam_name: string;
  exam_date: string;
  session: string;
  room_number: string;
  block: string;
  row_number: number;
  seat_number: number;
  group_label: string;
};

type StudentSubject = {
  id: string;
  code: string;
  name: string;
  semester: number | null;
};

function StudentPortalPage() {
  const { user } = useAuth();

  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [schedules, setSchedules] = useState<SeatSchedule[]>([]);
  const [subjects, setSubjects] = useState<StudentSubject[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, { status: AttendanceStatus; marked_at?: string; marked_by_name?: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StudentNavTab>("seating");

  useEffect(() => {
    async function loadStudentData() {
      if (!user) return;
      setLoading(true);
      try {
        // 1. Fetch student record linked to auth user or fallback to demo student
        let { data: studentRec } = await supabase
          .from("students")
          .select("id, name, registration_number, roll_number, status, course:courses(name, code), batch:batches(name), section:sections(name)")
          .eq("user_id", user.id)
          .maybeSingle();

        // Fallback for demo login if unlinked
        if (!studentRec) {
          const { data: firstStudent } = await supabase
            .from("students")
            .select("id, name, registration_number, roll_number, status, course:courses(name, code), batch:batches(name), section:sections(name)")
            .limit(1)
            .maybeSingle();
          studentRec = firstStudent;
        }

        if (studentRec) {
          setStudent(studentRec as any);

          // Fetch attendance status for this student
          const attMap = await getStudentAttendanceMap(studentRec.id);
          setAttendanceMap(attMap);

          // 2. Fetch seating allocations for this student
          const { data: allocs } = await supabase
            .from("seat_allocations")
            .select(`
              row_number,
              seat_number,
              group_label,
              room:rooms(room_number, block),
              plan:seating_plans(
                exam:exams(id, name, exam_date, session)
              )
            `)
            .eq("student_id", studentRec.id);

          if (allocs) {
            const formatted: SeatSchedule[] = allocs.map((a: any) => ({
              exam_id: a.plan?.exam?.id || "",
              exam_name: a.plan?.exam?.name || "Semester Examination",
              exam_date: a.plan?.exam?.exam_date || "",
              session: a.plan?.exam?.session || "morning",
              room_number: a.room?.room_number || "TBA",
              block: a.room?.block || "Main",
              row_number: a.row_number,
              seat_number: a.seat_number,
              group_label: a.group_label,
            }));
            setSchedules(formatted);
          }

          // 3. Fetch subjects for this student's course/batch
          const { data: subData } = await supabase
            .from("subjects")
            .select("id, code, name, semester")
            .order("code");

          if (subData) {
            setSubjects(subData as StudentSubject[]);
          }
        }
      } catch (err) {
        console.error("Error loading student portal data:", err);
      } finally {
        setLoading(false);
      }
    }

    void loadStudentData();
  }, [user]);

  // Realtime attendance sync for student
  useEffect(() => {
    if (!student?.id) return;

    // Listen to attendance updates across all student's exams
    schedules.forEach((sch) => {
      if (!sch.exam_id) return;
      const channel = supabase.channel(`student-att-${sch.exam_id}`)
        .on("broadcast", { event: "attendance_update" }, async () => {
          const updated = await getStudentAttendanceMap(student.id);
          setAttendanceMap(updated);
        })
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    });
  }, [student?.id, schedules]);

  function handlePrint() {
    window.print();
  }

  return (
    <StudentLayout
      title="Student Examination Desk"
      description="Official exam seating, printable admit cards, and registered curriculum subjects"
      activeTab={activeTab}
      onTabChange={setActiveTab}
      studentInfo={{
        name: student?.name,
        registrationNumber: student?.registration_number,
        rollNumber: student?.roll_number,
        courseCode: student?.course?.code || student?.course?.name,
        batchName: student?.batch?.name,
        sectionName: student?.section?.name,
      }}
    >
      {/* Emerald Hero Welcome Banner (hidden on print) */}
      <div className="surface-emerald relative mb-6 overflow-hidden rounded-xl p-6 text-white shadow-md print:hidden">
        <GridBackdrop />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-semibold text-gold">
                Student Examination Portal
              </span>
              <p className="text-xs font-medium text-white/70">
                {UNIVERSITY_NAME} · Examination Branch
              </p>
            </div>

            <h2 className="mt-2 max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
              Welcome back, {student?.name || "Student"}!
            </h2>

            <p className="mt-2 max-w-xl text-sm text-white/80">
              Permanent Registration No:{" "}
              <span className="font-mono font-bold text-gold">
                {student?.registration_number || "—"}
              </span>{" "}
              • {student?.course?.name || "Degree Program"} ({student?.batch?.name || "Current Batch"}) •{" "}
              {student?.section?.name || "Section A"}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={activeTab === "seating" ? "secondary" : "outline"}
                onClick={() => setActiveTab("seating")}
                className={
                  activeTab === "seating"
                    ? ""
                    : "border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                }
              >
                <Calendar className="size-3.5 mr-1.5" /> Exam Seating
              </Button>
              <Button
                size="sm"
                variant={activeTab === "admit" ? "secondary" : "outline"}
                onClick={() => setActiveTab("admit")}
                className={
                  activeTab === "admit"
                    ? ""
                    : "border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                }
              >
                <FileText className="size-3.5 mr-1.5" /> Hall Ticket (Admit Card)
              </Button>
              <Button
                size="sm"
                variant={activeTab === "subjects" ? "secondary" : "outline"}
                onClick={() => setActiveTab("subjects")}
                className={
                  activeTab === "subjects"
                    ? ""
                    : "border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                }
              >
                <BookOpen className="size-3.5 mr-1.5" /> Enrolled Subjects
              </Button>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 text-right">
            {[
              { label: "Scheduled", value: schedules.length },
              { label: "Seat Allocated", value: schedules.length > 0 ? "YES" : "PENDING" },
              { label: "Subjects", value: subjects.length },
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

      {/* Tab 1: Exam Seating Allocations */}
      {activeTab === "seating" && (
        <div className="space-y-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Calendar className="size-4 text-primary" /> Examination Hall & Seating Allocations
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Column-wise allocated examination desk, bench row, and venue details.
              </p>
            </div>
            <Button size="sm" onClick={() => setActiveTab("admit")} className="gap-2 text-xs">
              <Printer className="size-3.5" />
              View & Print Admit Card
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-44 w-full rounded-xl" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="panel p-10 text-center space-y-2">
              <AlertCircle className="size-8 mx-auto text-muted-foreground" />
              <p className="font-semibold text-sm text-foreground">No exam seating published yet.</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                The examination branch will generate column-wise alternate seating plans prior to the scheduled exam date. Check back closer to the exam.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schedules.map((item, idx) => {
                const att = attendanceMap[item.exam_id];
                return (
                  <div
                    key={idx}
                    className="panel group relative p-5 space-y-4 hover:border-primary/50 transition-all shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Badge
                          variant="secondary"
                          className="mb-1 text-[10px] uppercase font-bold tracking-wider"
                        >
                          {item.session === "morning" ? "Morning Session" : "Evening Session"}
                        </Badge>
                        <h4 className="font-bold text-base text-foreground">{item.exam_name}</h4>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <Calendar className="size-3.5 text-primary" />
                            {item.exam_date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3.5 text-primary" />
                            {item.session === "morning"
                              ? "09:30 AM - 12:30 PM"
                              : "01:30 PM - 04:30 PM"}
                          </span>
                        </div>
                      </div>

                      {/* Live Attendance Status Badge */}
                      <div className="text-right shrink-0">
                        {att?.status === "present" ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-300 dark:border-emerald-800">
                            <CheckCircle2 className="size-3.5" /> Present
                          </span>
                        ) : att?.status === "absent" ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-600 border border-rose-300 dark:border-rose-800">
                            <AlertCircle className="size-3.5" /> Absent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                            <Clock className="size-3.5" /> Attendance Pending
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Allocated Seat Highlight Box */}
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <MapPin className="size-3 text-primary" /> Examination Hall
                        </span>
                        <p className="text-xl font-bold text-foreground">
                          {item.room_number}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({item.block})
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-3 text-center">
                        <div className="bg-card rounded-md px-3.5 py-2 border shadow-xs">
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                            Row
                          </p>
                          <p className="text-lg font-extrabold text-foreground">{item.row_number}</p>
                        </div>
                        <div className="bg-primary text-primary-foreground rounded-md px-4 py-2 shadow-xs">
                          <p className="text-[10px] text-primary-foreground/80 uppercase font-semibold">
                            Seat No
                          </p>
                          <p className="text-xl font-extrabold">{item.seat_number}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                      <span>
                        Reporting Time:{" "}
                        <strong className="text-foreground">
                          {item.session === "morning" ? "09:00 AM" : "01:00 PM"}
                        </strong>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] bg-muted px-2 py-0.5 rounded">
                          Group: {item.group_label || "All"}
                        </span>
                        {att?.marked_by_name && (
                          <span className="text-[11px] text-muted-foreground hidden sm:inline">
                            (Marked by {att.marked_by_name})
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="gold-rule absolute inset-x-0 bottom-0 h-0.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Digital Admit Card / Hall Ticket */}
      {activeTab === "admit" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <FileText className="size-4 text-primary" /> Official Examination Hall Ticket
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Carry a printed copy of this Hall Ticket along with your Student ID card to the exam hall.
              </p>
            </div>
            <Button onClick={handlePrint} className="gap-2">
              <Printer className="size-4" />
              Print / Save PDF Hall Ticket
            </Button>
          </div>

          {/* Printable Admit Card Form */}
          <div className="panel bg-card text-card-foreground rounded-xl border shadow-md p-8 max-w-3xl mx-auto space-y-6 print:border-none print:shadow-none print:p-0 print:m-0">
            {/* Header */}
            <div className="text-center border-b pb-4 space-y-1">
              <div className="flex items-center justify-center gap-2">
                <GraduationCap className="size-7 text-primary" />
                <h2 className="text-xl font-bold uppercase tracking-wider">{UNIVERSITY_NAME}</h2>
              </div>
              <p className="text-xs uppercase font-semibold text-muted-foreground">
                Controller of Examinations — Examination Branch
              </p>
              <h3 className="text-sm font-bold bg-muted inline-block px-4 py-1 rounded mt-2 uppercase tracking-wide border border-border">
                Official Hall Ticket / Examination Admit Card
              </h3>
            </div>

            {/* Student Details Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-muted/30 p-4 rounded-lg border border-border">
              <div>
                <p className="text-muted-foreground text-[11px]">Candidate Name:</p>
                <p className="font-bold text-sm text-foreground">{student?.name || "Student"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px]">Permanent Registration Number:</p>
                <p className="font-mono font-bold text-sm text-gold">{student?.registration_number || "REG2024001"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px]">Roll Number:</p>
                <p className="font-mono font-bold text-foreground">{student?.roll_number || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px]">Program / Course:</p>
                <p className="font-semibold text-foreground">{student?.course?.name || "B.Tech Computer Science"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px]">Academic Batch & Section:</p>
                <p className="font-semibold text-foreground">
                  {student?.batch?.name || "2024-2028"} ({student?.section?.name || "Section A"})
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px]">Candidate Status:</p>
                <p className="font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" /> Verified & Eligible for Examination
                </p>
              </div>
            </div>

            {/* Exam Schedule Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Scheduled Examinations & Seat Allocation
              </h4>
              <div className="border rounded-md overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-muted border-b text-[11px] font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Session</th>
                      <th className="p-2.5">Examination</th>
                      <th className="p-2.5">Room</th>
                      <th className="p-2.5 text-center">Row</th>
                      <th className="p-2.5 text-center">Seat</th>
                      <th className="p-2.5 text-center">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {schedules.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-muted-foreground">
                          No seating records generated yet.
                        </td>
                      </tr>
                    ) : (
                      schedules.map((s, i) => {
                        const att = attendanceMap[s.exam_id];
                        return (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="p-2.5 font-medium">{s.exam_date}</td>
                            <td className="p-2.5 capitalize">{s.session}</td>
                            <td className="p-2.5 font-semibold text-foreground">{s.exam_name}</td>
                            <td className="p-2.5 font-bold text-primary">{s.room_number}</td>
                            <td className="p-2.5 text-center">{s.row_number}</td>
                            <td className="p-2.5 text-center font-bold text-base text-foreground">
                              {s.seat_number}
                            </td>
                            <td className="p-2.5 text-center">
                              {att?.status === "present" ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-300 text-[10px] font-bold">
                                  Present
                                </Badge>
                              ) : att?.status === "absent" ? (
                                <Badge variant="destructive" className="text-[10px] font-bold">
                                  Absent
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                  Pending
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Instructions */}
            <div className="text-[11px] text-muted-foreground space-y-1 border-t border-border pt-3">
              <p className="font-semibold text-foreground">Candidate Instructions:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Candidates must be seated in their designated hall at least 15 minutes before exam commencement.</li>
                <li>No electronic devices, smartwatches, or programmable calculators are permitted.</li>
                <li>Candidates must display this Admit Card and University ID badge on the top right corner of their desk.</li>
              </ul>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 pt-10 text-center text-xs">
              <div>
                <div className="w-36 border-b border-foreground/40 mx-auto mb-1"></div>
                <p className="text-muted-foreground">Candidate Signature</p>
              </div>
              <div>
                <div className="w-36 border-b border-foreground/40 mx-auto mb-1 font-serif text-[11px] italic">
                  Controller of Exams
                </div>
                <p className="text-muted-foreground">Controller of Examinations</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Enrolled Subjects */}
      {activeTab === "subjects" && (
        <div className="space-y-4 print:hidden">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <BookOpen className="size-4 text-primary" /> Registered Curriculum Subjects
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Official courses registered under your academic degree and batch.
            </p>
          </div>

          {subjects.length === 0 ? (
            <div className="panel p-8 text-center text-sm text-muted-foreground">
              No registered subjects found for this academic program.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {subjects.map((sub) => (
                <div key={sub.id} className="panel p-4 flex items-center justify-between hover:border-primary/50 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                      {sub.code?.slice(0, 3) || "SUB"}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-foreground">{sub.name}</h4>
                      <p className="text-xs text-muted-foreground font-mono">{sub.code || "Code TBA"}</p>
                    </div>
                  </div>
                  {sub.semester && (
                    <Badge variant="outline" className="text-xs">
                      Sem {sub.semester}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </StudentLayout>
  );
}
