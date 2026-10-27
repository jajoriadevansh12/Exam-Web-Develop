import { Link, createFileRoute } from "@tanstack/react-router";
import { GraduationCap, FileSpreadsheet, ShieldCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UNIVERSITY_NAME } from "@/lib/db";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Examination Branch ERP | XYZ University" },
      {
        name: "description",
        content:
          "Sign in to the XYZ University examination branch console to manage courses, batches, sections, students and Excel synchronisation.",
      },
      { property: "og:title", content: "Examination Branch ERP | XYZ University" },
      {
        property: "og:description",
        content:
          "Examination branch console for courses, batches, sections, student records and smart Excel synchronisation.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: FileSpreadsheet,
    title: "Master Excel import",
    body: "Upload one workbook per batch. Sections are created automatically and duplicates are skipped.",
  },
  {
    icon: RefreshCw,
    title: "Smart synchronisation",
    body: "Re-upload a batch and review name, roll number and section changes before anything is written.",
  },
  {
    icon: ShieldCheck,
    title: "Full audit trail",
    body: "Every student update, section move and import is recorded with who did it and when.",
  },
];

function Landing() {
  const { session, loading } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="size-5" />
          </div>
          <span className="font-display text-sm font-semibold tracking-tight">
            {UNIVERSITY_NAME} <span className="text-muted-foreground">· Examination Branch</span>
          </span>
          <div className="ml-auto">
            {loading ? null : session ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link to="/auth">Staff sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <section className="surface-emerald relative overflow-hidden text-primary-foreground">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
              Examination management system
            </p>
            <h2 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Run the examination branch from a single, auditable console.
            </h2>
            <p className="mt-5 max-w-xl text-primary-foreground/75">
              Courses, batches, sections and student records with registration number as the
              permanent identity — plus Excel imports that diff against the database before they
              change anything.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to={session ? "/dashboard" : "/auth"}>
                  {session ? "Open dashboard" : "Staff sign in"}
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { k: "Registration no.", v: "Permanent identity" },
              { k: "Excel sync", v: "Diff before write" },
              { k: "Seating", v: "Anti-malpractice" },
              { k: "Audit log", v: "Every change" },
            ].map((tile) => (
              <div
                key={tile.k}
                className="rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 p-4 backdrop-blur-sm"
              >
                <p className="text-[11px] uppercase tracking-[0.12em] text-gold">{tile.k}</p>
                <p className="mt-1.5 text-sm font-medium">{tile.v}</p>
              </div>
            ))}
          </div>
        </div>
        <span className="gold-rule absolute inset-x-0 bottom-0 h-px" />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="panel group p-6 transition-shadow hover:shadow-lg"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <feature.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold tracking-tight">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
          {UNIVERSITY_NAME} · Examination Branch · Internal staff system
        </div>
      </footer>
    </div>
  );
}
