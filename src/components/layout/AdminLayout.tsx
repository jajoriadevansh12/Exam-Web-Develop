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
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { UNIVERSITY_NAME } from "@/lib/db";
import { cn } from "@/lib/utils";

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

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

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