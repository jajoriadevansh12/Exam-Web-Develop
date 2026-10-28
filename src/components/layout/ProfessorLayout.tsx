import { useState, type ReactNode } from "react";
import {
  Users,
  CalendarDays,
  Calendar,
  ShieldCheck,
  LogOut,
  Menu,
  Briefcase,
  FileCheck,
  Clock,
  Sparkles,
  Bell,
  MapPin,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/lib/auth";
import { UNIVERSITY_NAME } from "@/lib/db";
import { cn } from "@/lib/utils";

export type ProfessorNavTab = "duties" | "leaves" | "guidelines";

export type ProfessorNotification = {
  id: string;
  title: string;
  room?: string;
  session?: string;
  date?: string;
  notifiedAt?: string | null;
};

export function ProfessorLayout({
  title,
  description,
  activeTab,
  onTabChange,
  professorInfo,
  notifications = [],
  onNotificationClick,
  actions,
  children,
}: {
  title: string;
  description?: string;
  activeTab?: ProfessorNavTab;
  onTabChange?: (tab: ProfessorNavTab) => void;
  professorInfo?: {
    name?: string;
    employeeId?: string;
    department?: string;
    email?: string;
    maxDuties?: number;
    assignedDutiesCount?: number;
  };
  notifications?: ProfessorNotification[];
  onNotificationClick?: (notification: ProfessorNotification) => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const navItems: Array<{ id: ProfessorNavTab; label: string; icon: typeof Users; desc: string }> = [
    {
      id: "duties",
      label: "Invigilation Duties",
      icon: CalendarDays,
      desc: "Exam halls & room rosters",
    },
    {
      id: "leaves",
      label: "Leave Requests",
      icon: Calendar,
      desc: "Apply & track exam leaves",
    },
    {
      id: "guidelines",
      label: "Invigilator Guidelines",
      icon: ShieldCheck,
      desc: "Code of conduct & exam rules",
    },
  ];

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
              <Users className="size-5" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold text-sidebar-foreground">
                Exam Suite
              </p>
              <p className="text-xs text-sidebar-foreground/70 truncate max-w-[140px]">
                Faculty Console
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              Faculty Duties
            </p>
            <div className="space-y-1">
              {navItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (onTabChange) onTabChange(item.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-xs font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-xs"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate leading-none">{item.label}</p>
                      <p className="text-[10px] text-sidebar-foreground/60 mt-0.5 truncate">
                        {item.desc}
                      </p>
                    </div>
                    {item.id === "duties" && notifications.length > 0 && (
                      <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-black shrink-0">
                        {notifications.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Professor Information Card in Sidebar */}
          {professorInfo && (
            <div className="rounded-lg bg-black/25 p-3.5 text-xs space-y-2 border border-white/10 backdrop-blur-xs">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-sidebar-primary/20 text-sidebar-primary">
                  <Briefcase className="size-3.5" />
                </span>
                <p className="font-semibold text-sidebar-foreground truncate">
                  {professorInfo.name || "Professor"}
                </p>
              </div>

              <div className="space-y-1 pt-1 text-[11px] border-t border-white/10 text-sidebar-foreground/80 font-mono">
                <p className="flex justify-between">
                  <span className="text-sidebar-foreground/60">Emp ID:</span>
                  <span className="font-semibold text-gold">{professorInfo.employeeId || "—"}</span>
                </p>
                {professorInfo.department && (
                  <p className="flex justify-between">
                    <span className="text-sidebar-foreground/60">Dept:</span>
                    <span className="truncate max-w-[120px] text-right">{professorInfo.department}</span>
                  </p>
                )}
                <p className="flex justify-between">
                  <span className="text-sidebar-foreground/60">Duties:</span>
                  <span>
                    {professorInfo.assignedDutiesCount ?? 0} / {professorInfo.maxDuties ?? 10} max
                  </span>
                </p>
              </div>
            </div>
          )}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-sidebar-border p-3 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-sidebar-foreground/70">
            <ShieldCheck className="size-3.5 text-blue-400" />
            <span className="truncate">Faculty Verified</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut()}
            className="w-full justify-start text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            <LogOut className="size-4 mr-2" /> Sign out
          </Button>
        </div>
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

          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span>{professorInfo?.employeeId || user?.email}</span>
            <span>·</span>
            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200 text-[11px] py-0.5">
              Invigilator Account
            </Badge>
          </div>

          {/* Notification Bell */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative size-9 rounded-full text-foreground hover:bg-muted"
                aria-label="View notifications"
              >
                <Bell className="size-4.5" />
                {notifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex size-4.5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white shadow-xs animate-pulse">
                    {notifications.length > 9 ? "9+" : notifications.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-80 sm:w-96 p-0 shadow-xl border-border rounded-xl overflow-hidden bg-card text-card-foreground"
            >
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bell className="size-4 text-primary" />
                  <h3 className="font-semibold text-sm text-foreground">Duty Notifications</h3>
                </div>
                {notifications.length > 0 ? (
                  <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">
                    {notifications.length} New
                  </Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Up to date</span>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center space-y-2">
                    <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Bell className="size-5" />
                    </div>
                    <p className="text-xs font-semibold text-foreground">No new notifications</p>
                    <p className="text-[11px] text-muted-foreground">
                      When the exam branch assigns and notifies invigilation duties, they will appear here.
                    </p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (onNotificationClick) onNotificationClick(n);
                      }}
                      className="p-3.5 hover:bg-muted/50 cursor-pointer transition-colors space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                          <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="line-clamp-1">{n.title}</span>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-600 shrink-0">
                          Duty Notified
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {n.room && (
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <MapPin className="size-3 text-primary" />
                            {n.room}
                          </span>
                        )}
                        {n.date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="size-3 text-primary" />
                            {n.date}
                          </span>
                        )}
                      </div>

                      {n.session && (
                        <p className="text-[10px] text-muted-foreground">
                          {n.session}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {notifications.length > 0 && (
                <div className="p-2 border-t border-border bg-muted/20 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-primary font-semibold h-7"
                    onClick={() => {
                      if (onTabChange) onTabChange("duties");
                    }}
                  >
                    View All Invigilation Duties <ChevronRight className="size-3 ml-1" />
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" onClick={() => void signOut()} className="gap-1.5 text-xs">
            <LogOut className="size-3.5" /> Sign out
          </Button>
        </header>

        {/* Page content */}
        <main className="mx-auto max-w-7xl p-4 lg:p-8">
          {actions ? <div className="mb-4 flex flex-wrap gap-2">{actions}</div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
