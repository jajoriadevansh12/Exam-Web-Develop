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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { UNIVERSITY_NAME } from "@/lib/db";
import { cn } from "@/lib/utils";

export type ProfessorNavTab = "duties" | "leaves" | "guidelines";

export function ProfessorLayout({
  title,
  description,
  activeTab,
  onTabChange,
  professorInfo,
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
