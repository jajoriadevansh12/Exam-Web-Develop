import { useState, type ReactNode } from "react";
import {
  GraduationCap,
  Calendar,
  FileText,
  BookOpen,
  LogOut,
  Menu,
  ShieldCheck,
  User,
  Sparkles,
  Layers,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { UNIVERSITY_NAME } from "@/lib/db";
import { cn } from "@/lib/utils";

export type StudentNavTab = "seating" | "admit" | "subjects";

export function StudentLayout({
  title,
  description,
  activeTab,
  onTabChange,
  studentInfo,
  actions,
  children,
}: {
  title: string;
  description?: string;
  activeTab?: StudentNavTab;
  onTabChange?: (tab: StudentNavTab) => void;
  studentInfo?: {
    name?: string;
    registrationNumber?: string;
    rollNumber?: string | null;
    courseCode?: string;
    batchName?: string;
    sectionName?: string;
  };
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const navItems: Array<{ id: StudentNavTab; label: string; icon: typeof Calendar; desc: string }> = [
    {
      id: "seating",
      label: "Exam Seating",
      icon: Calendar,
      desc: "Hall, row & seat allocations",
    },
    {
      id: "admit",
      label: "Admit Card",
      icon: FileText,
      desc: "Official printable hall ticket",
    },
    {
      id: "subjects",
      label: "Registered Subjects",
      icon: BookOpen,
      desc: "Course curriculum & syllabus",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ================= SIDEBAR (hidden on print) ================= */}
      <aside
        className={cn(
          "surface-emerald fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col text-sidebar-foreground shadow-2xl transition-transform duration-300 print:hidden lg:translate-x-0",
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
                Student Portal
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              Examination Desk
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

          {/* Student Academic Identity Card in Sidebar */}
          {studentInfo && (
            <div className="rounded-lg bg-black/25 p-3.5 text-xs space-y-2 border border-white/10 backdrop-blur-xs">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-sidebar-primary/20 text-sidebar-primary">
                  <User className="size-3.5" />
                </span>
                <p className="font-semibold text-sidebar-foreground truncate">
                  {studentInfo.name || "Student"}
                </p>
              </div>

              <div className="space-y-1 pt-1 text-[11px] border-t border-white/10 text-sidebar-foreground/80 font-mono">
                <p className="flex justify-between">
                  <span className="text-sidebar-foreground/60">Reg No:</span>
                  <span className="font-semibold text-gold">{studentInfo.registrationNumber || "—"}</span>
                </p>
                {studentInfo.rollNumber && (
                  <p className="flex justify-between">
                    <span className="text-sidebar-foreground/60">Roll No:</span>
                    <span>{studentInfo.rollNumber}</span>
                  </p>
                )}
                {studentInfo.courseCode && (
                  <p className="flex justify-between">
                    <span className="text-sidebar-foreground/60">Course:</span>
                    <span>{studentInfo.courseCode}</span>
                  </p>
                )}
                {studentInfo.batchName && (
                  <p className="flex justify-between">
                    <span className="text-sidebar-foreground/60">Batch:</span>
                    <span>{studentInfo.batchName}</span>
                  </p>
                )}
                {studentInfo.sectionName && (
                  <p className="flex justify-between">
                    <span className="text-sidebar-foreground/60">Section:</span>
                    <span>{studentInfo.sectionName}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-sidebar-border p-3 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-sidebar-foreground/70">
            <ShieldCheck className="size-3.5 text-emerald-400" />
            <span className="truncate">Student Verified</span>
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
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-xs print:hidden lg:hidden"
        />
      ) : null}

      {/* ================= MAIN CONTENT ================= */}
      <div className="lg:pl-64">
        {/* Header (hidden on print) */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card px-4 print:hidden lg:px-6">
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
            <span>{studentInfo?.registrationNumber || user?.email}</span>
            <span>·</span>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-[11px] py-0.5">
              Student Account
            </Badge>
          </div>

          <Button variant="outline" size="sm" onClick={() => void signOut()} className="gap-1.5 text-xs">
            <LogOut className="size-3.5" /> Sign out
          </Button>
        </header>

        {/* Page content */}
        <main className="mx-auto max-w-7xl p-4 lg:p-8">
          {actions ? <div className="mb-4 flex flex-wrap gap-2 print:hidden">{actions}</div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
