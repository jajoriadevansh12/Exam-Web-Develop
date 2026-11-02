import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  Layers,
  History,
  Users,
  Upload,
  LogOut,
  Menu,
  Zap,
  Sparkles,
  Bell,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";
import { UNIVERSITY_NAME } from "@/lib/db";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { approveLeave } from "@/lib/professors";
import { toast } from "sonner";

type NavItem = {
  to: NonNullable<LinkProps["to"]>;
  label: string;
  icon: typeof LayoutDashboard;
};

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Overview",
    items: [
      {
        to: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
      },
    ],
  },

  {
    label: "Academic structure",
    items: [
      {
        to: "/courses",
        label: "Courses",
        icon: BookOpen,
      },
      {
        to: "/batches",
        label: "Batches",
        icon: Layers,
      },
      {
        to: "/sections",
        label: "Sections",
        icon: GraduationCap,
      },
    ],
  },

  {
    label: "Student records",
    items: [
      {
        to: "/students",
        label: "Students",
        icon: Users,
      },
      {
        to: "/students/import",
        label: "Excel Import",
        icon: Upload,
      },
    ],
  },

  {
    label: "Examinations",
    items: [
      {
        to: "/exams/seating",
        label: "Seating Arrangement",
        icon: Sparkles,
      },
      {
        to: "/exams",
        label: "Examinations",
        icon: CalendarDays,
      },
      {
        to: "/rooms",
        label: "Exam Halls",
        icon: DoorOpen,
      },
      {
        to: "/professors",
        label: "Professors",
        icon: Users,
      },
      {
        to: "/logs",
        label: "Activity Logs",
        icon: History,
      },
    ],
  },
];

export function AdminLayout({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();

  const [open, setOpen] = useState(false);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const fetchPendingLeaves = async () => {
    try {
      const { data, error } = await supabase
        .from("professor_leaves")
        .select("id, leave_date, reason, created_at, approved, professors(name, employee_id, department)")
        .eq("approved", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const filtered = (data || []).filter((l: any) => !l.reason?.startsWith("[REJECTED]"));
      setPendingLeaves(filtered);
    } catch (err) {
      console.error("Error loading pending leaves:", err);
    }
  };

  useEffect(() => {
    void fetchPendingLeaves();

    const channel = supabase
      .channel("exam-suite-admin-notifications-center")
      .on("broadcast", { event: "new-leave-request" }, (payload: any) => {
        const p = payload.payload;
        toast.info(
          `🔔 New Faculty Leave Request: ${p?.professor_name || "A professor"} applied for leave on ${p?.leave_date || "exam day"}.`,
          { duration: 8000 }
        );
        void fetchPendingLeaves();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "professor_leaves" },
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            toast.info("🔔 New Faculty Leave Request received!", { duration: 6000 });
          }
          void fetchPendingLeaves();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const handleQuickApprove = async (leaveId: string, profName: string) => {
    setApprovingId(leaveId);
    try {
      const res = await approveLeave(leaveId);
      if (res?.unassignedDuties > 0) {
        toast.success(`Leave approved for ${profName}! Conflicting duty unassigned.`);
      } else {
        toast.success(`Leave approved for ${profName}!`);
      }
      void fetchPendingLeaves();
    } catch (err: any) {
      toast.error("Failed to approve leave: " + err.message);
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ================= SIDEBAR ================= */}

      <aside
        className={cn(
          "surface-emerald fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col text-sidebar-foreground shadow-2xl transition-transform duration-300 lg:translate-x-0",
          open && "translate-x-0",
        )}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <GraduationCap className="size-5" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold text-sidebar-foreground">
                Exam Suite
              </p>
              <p className="text-xs text-sidebar-foreground/70 truncate max-w-[140px]">
                {UNIVERSITY_NAME}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    item.to === "/students"
                      ? pathname === "/students"
                      : pathname.startsWith(String(item.to));

                  return (
                    <Link
                      key={String(item.to)}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )}
                    >
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Mobile overlay */}
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-xs lg:hidden"
        />
      ) : null}

      {/* ================= MAIN CONTENT ================= */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
          >
            <Menu className="size-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {description ? (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>

          {/* Admin Notification Bell */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative flex size-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors cursor-pointer shadow-xs"
                aria-label="View notifications"
              >
                <Bell className="size-4 text-foreground" />
                {pendingLeaves.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-sm ring-2 ring-card animate-pulse">
                    {pendingLeaves.length > 9 ? "9+" : pendingLeaves.length}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 sm:w-96 p-0 shadow-xl border-border bg-card" align="end">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="size-4 text-primary" />
                  <h3 className="font-semibold text-sm text-foreground">Faculty Notifications</h3>
                </div>
                {pendingLeaves.length > 0 ? (
                  <Badge className="bg-rose-600 text-white text-[10px] px-2 py-0.5">
                    {pendingLeaves.length} Pending Request{pendingLeaves.length > 1 ? "s" : ""}
                  </Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground font-medium">All clear</span>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {pendingLeaves.length === 0 ? (
                  <div className="p-6 text-center space-y-2">
                    <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <CheckCircle2 className="size-5 text-emerald-500" />
                    </div>
                    <p className="text-xs font-semibold text-foreground">No pending leave requests</p>
                    <p className="text-[11px] text-muted-foreground">
                      Faculty leave requests and conflict alerts will appear here in real time.
                    </p>
                  </div>
                ) : (
                  pendingLeaves.map((leave) => {
                    const prof = leave.professors;
                    const profName = prof?.name || "Professor";
                    const isApproving = approvingId === leave.id;

                    return (
                      <div key={leave.id} className="p-3.5 hover:bg-muted/30 transition-colors space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                              <span className="size-2 rounded-full bg-amber-500 shrink-0" />
                              <span>{profName}</span>
                              {prof?.employee_id && (
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  ({prof.employee_id})
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {prof?.department || "Faculty Member"}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 bg-amber-500/10 shrink-0">
                            Leave Request
                          </Badge>
                        </div>

                        <div className="rounded-md bg-muted/60 p-2 text-xs space-y-1">
                          <div className="flex items-center gap-1.5 font-medium text-foreground text-[11px]">
                            <Calendar className="size-3 text-primary shrink-0" />
                            <span>Requested Date: <strong className="text-primary">{leave.leave_date}</strong></span>
                          </div>
                          {leave.reason && (
                            <p className="text-[11px] text-muted-foreground italic pl-4.5">
                              "{leave.reason}"
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <Link
                            to="/professors"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
                          >
                            <span>Review</span>
                            <ExternalLink className="size-3" />
                          </Link>
                          <Button
                            size="sm"
                            disabled={isApproving}
                            onClick={() => void handleQuickApprove(leave.id, profName)}
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-2.5"
                          >
                            {isApproving ? (
                              <Loader2 className="size-3 animate-spin mr-1" />
                            ) : (
                              <CheckCircle2 className="size-3 mr-1" />
                            )}
                            Approve
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-border bg-muted/20 p-2 text-center">
                <Link
                  to="/professors"
                  className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                >
                  <span>Manage All Faculty & Leaves</span>
                  <ExternalLink className="size-3" />
                </Link>
              </div>
            </PopoverContent>
          </Popover>

          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span>{user?.email}</span>
            <span>·</span>
            <span>Exam Branch</span>
          </div>

          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </header>

        {/* Page content */}
        <main className="mx-auto max-w-7xl p-4 lg:p-8">
          {actions ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {actions}
            </div>
          ) : null}

          {children}
        </main>
      </div>
    </div>
  );
}