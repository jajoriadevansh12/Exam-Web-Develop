import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  Layers,
  Users,
  UserCheck,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowRight,
  GitBranch,
} from "lucide-react";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { StudentDrillDown, type DrillLevel } from "@/components/dashboard/StudentDrillDown";
import { GridBackdrop } from "@/components/effects/GridBackdrop";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardStats, UNIVERSITY_NAME } from "@/lib/db";
import { openWindow, usePopupRefresh } from "@/lib/popup";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | XYZ University Exam Branch" },
      {
        name: "description",
        content:
          "Live totals for students, courses, batches and sections plus the most recent Excel imports.",
      },
      { property: "og:title", content: "Dashboard | XYZ University Exam Branch" },
      {
        property: "og:description",
        content: "Examination branch overview: student, course, batch and section totals.",
      },
    ],
  }),
  component: DashboardPage,
});

function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  loading,
  accent,
  hint,
  share,
  onClick,
}: {
  label: string;
  value: number;
  sublabel?: string;
  icon: typeof Users;
  loading: boolean;
  accent?: boolean;
  hint?: string;
  share?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`group relative flex h-full min-h-[168px] w-full flex-col justify-between rounded-2xl border p-5 text-left transition-all duration-300 shadow-xs ${
        accent
          ? "border-emerald-600/30 bg-gradient-to-br from-[#E6F4EC]/50 via-card to-card hover:border-emerald-600/60 hover:shadow-xl hover:shadow-emerald-950/5 dark:from-emerald-950/20"
          : "border-border/80 bg-card hover:border-emerald-600/40 hover:shadow-lg hover:shadow-black/5"
      } ${
        onClick
          ? "cursor-pointer hover:-translate-y-1"
          : "cursor-default"
      }`}
    >
      {/* Decorative ambient light */}
      <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-emerald-500/5 blur-2xl group-hover:bg-emerald-500/10 transition-all duration-500" />

      {/* Top Row: Category Label & Icon Badge */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`size-2 shrink-0 rounded-full ${accent ? "bg-emerald-600 animate-pulse" : "bg-muted-foreground/40"}`} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </span>
        </div>
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110 shadow-xs ${
            accent
              ? "bg-[#E6F4EC] text-[#166534] dark:bg-emerald-950/60 dark:text-emerald-300 group-hover:bg-[#166534] group-hover:text-white"
              : "bg-muted/70 text-foreground/80 group-hover:bg-[#E6F4EC] group-hover:text-[#166534]"
          }`}
        >
          <Icon className="size-5" />
        </span>
      </div>

      {/* Middle Row: Metric Number & Subtitle */}
      <div className="my-3">
        {loading ? (
          <Skeleton className="h-9 w-24 rounded-lg" />
        ) : (
          <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground tabular-nums">
            {value.toLocaleString()}
          </p>
        )}

        {sublabel ? (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
            {sublabel}
          </p>
        ) : null}

        {typeof share === "number" ? (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              <span>Attendance status</span>
              <span className="font-bold text-[#166534] dark:text-emerald-400">{Math.round(share)}% active</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#14532D] to-[#1F7A4D] transition-all duration-700 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom Action Link */}
      {hint ? (
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-border/50 text-xs font-semibold text-[#166534] dark:text-emerald-400 group-hover:text-[#0F4526] transition-colors">
          <span className="truncate pr-2">{hint}</span>
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#E6F4EC] dark:bg-emerald-950/60 transition-transform duration-200 group-hover:translate-x-1">
            <ArrowRight className="size-3.5" />
          </div>
        </div>
      ) : null}

      {/* Bottom Edge Accent Line */}
      <span className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-[#166534] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-b-2xl" />
    </button>
  );
}

function DashboardPage() {
  const navigate = useNavigate();
  const [drill, setDrill] = useState<DrillLevel | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
  });
  usePopupRefresh(useCallback(() => void refetch(), [refetch]));
  const activeShare = data?.students ? (data.activeStudents / data.students) * 100 : 0;

  return (
    <AdminLayout title="Dashboard">
      {error ? (
        <p className="panel p-4 text-sm text-destructive">{(error as Error).message}</p>
      ) : null}

      <div className="surface-emerald relative mb-6 overflow-hidden rounded-xl p-6 text-white shadow-md">
        <GridBackdrop />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gold">
              {UNIVERSITY_NAME} · Examination Branch
            </p>
            <h2 className="mt-2 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything the exam branch runs on, in one unified console.
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/80">
              Student master records, batch synchronisation, hall allocation and seating plans —
              reconciled against one permanent registration number.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link to="/students">Open student register</Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <Link to="/exams/seating">Seating arrangement</Link>
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-right">
            {[
              { label: "Register", value: data?.students ?? 0 },
              { label: "Active", value: data?.activeStudents ?? 0 },
              { label: "Courses", value: data?.courses ?? 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-black/20 p-3 backdrop-blur-xs">
                <dt className="text-xs font-medium uppercase tracking-wide text-white/70">
                  {item.label}
                </dt>
                <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-gold">
                  {item.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <span className="gold-rule absolute inset-x-0 bottom-0 h-0.5" />
      </div>

      {/* Executive 3x2 Bento Metric Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <StatCard
          label="Total Student Register"
          value={data?.students ?? 0}
          sublabel="Permanent verified university candidate IDs"
          icon={Users}
          loading={isLoading}
          accent
          hint="Open Student ID Cards"
          share={100}
          onClick={() => openWindow("/students/cards", "student-cards", 1180, 900)}
        />
        <StatCard
          label="Active Candidates"
          value={data?.activeStudents ?? 0}
          sublabel="Candidates eligible for examination hall tickets"
          icon={UserCheck}
          loading={isLoading}
          share={activeShare}
          hint="Explore Full Student Register"
          onClick={() => void navigate({ to: "/students" })}
        />
        <StatCard
          label="Course Breakdown"
          value={data?.students ?? 0}
          sublabel="Interactive distribution by course, batch & section"
          icon={GitBranch}
          loading={isLoading}
          hint="Open Interactive Drill-Down"
          onClick={() => setDrill("courses")}
        />
        <StatCard
          label="Programmes & Degrees"
          value={data?.courses ?? 0}
          sublabel="Academic degree courses (B.Tech, MCA, etc.)"
          icon={BookOpen}
          loading={isLoading}
          hint="Manage Academic Courses"
          onClick={() => void navigate({ to: "/courses" })}
        />
        <StatCard
          label="Academic Batches"
          value={data?.batches ?? 0}
          sublabel="Active graduating cohorts and year groups"
          icon={Layers}
          loading={isLoading}
          hint="Inspect Batch Cohorts"
          onClick={() => setDrill("batches")}
        />
        <StatCard
          label="Classroom Sections"
          value={data?.sections ?? 0}
          sublabel="Room and classroom divisions for exam seating"
          icon={GraduationCap}
          loading={isLoading}
          hint="Inspect Section Breakdown"
          onClick={() => setDrill("sections")}
        />
      </div>

      <StudentDrillDown
        open={drill !== null}
        onOpenChange={(next) => setDrill(next ? drill : null)}
        startLevel={drill ?? "courses"}
      />

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="panel lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">Recent imports</h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/students/import">New import</Link>
            </Button>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : data?.recentImports.length ? (
            <ul className="divide-y divide-border">
              {data.recentImports.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <FileSpreadsheet className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{entry.file_name ?? "Workbook"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()} · {entry.total_rows} rows
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{entry.created_count}</span> new ·{" "}
                    <span className="font-medium text-foreground">{entry.updated_count}</span>{" "}
                    updated ·{" "}
                    <span className="font-medium text-foreground">{entry.skipped_count}</span>{" "}
                    skipped
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">
              No imports yet. Create a course and batch, then upload the master student workbook.
            </p>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="text-sm font-semibold tracking-tight">Setup checklist</h2>
          <span className="gold-rule mt-3 block h-px" />
          <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li>
              1. Create courses such as B.Tech or MCA in{" "}
              <Link to="/courses" className="font-medium text-primary hover:underline">
                Courses
              </Link>
              .
            </li>
            <li>
              2. Add batches like 2024-2028 in{" "}
              <Link to="/batches" className="font-medium text-primary hover:underline">
                Batches
              </Link>
              .
            </li>
            <li>
              3. Upload the master Excel in{" "}
              <Link to="/students/import" className="font-medium text-primary hover:underline">
                Excel Import
              </Link>{" "}
              — sections are created automatically.
            </li>
          </ol>
        </div>
      </div>
    </AdminLayout>
  );
}