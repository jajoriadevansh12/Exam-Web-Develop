import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GraduationCap, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { UNIVERSITY_NAME } from "@/lib/db";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff Sign in | XYZ University Exam Branch" },
      {
        name: "description",
        content:
          "Secure sign in for examination branch staff and administrators.",
      },
      { property: "og:title", content: "Staff Sign in | XYZ University Exam Branch" },
      {
        property: "og:description",
        content: "Secure staff access to the XYZ University examination branch console.",
      },
    ],
  }),
  component: AuthPage,
});

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

function AuthPage() {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      if (role === "student") {
        void navigate({ to: "/student/portal" as any, replace: true });
      } else if (role === "professor") {
        void navigate({ to: "/professor/portal" as any, replace: true });
      } else {
        void navigate({ to: "/dashboard", replace: true });
      }
    }
  }, [loading, session, role, navigate]);

  const [oneClickTarget, setOneClickTarget] = useState<string | null>(null);

  async function loginWithCredentials(targetEmail: string, targetPass: string, roleName: string) {
    setEmail(targetEmail);
    setPassword(targetPass);
    setBusy(true);
    setOneClickTarget(roleName);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: targetPass,
      });
      if (error) throw error;
      
      // Determine role for instant redirect
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      const userRole = roleData?.role;
      toast.success(`Signed in as ${roleName.toUpperCase()}`);

      if (userRole === "student") {
        await navigate({ to: "/student/portal" as any, replace: true });
      } else if (userRole === "professor") {
        await navigate({ to: "/professor/portal" as any, replace: true });
      } else {
        await navigate({ to: "/dashboard", replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
      setOneClickTarget(null);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid details");
      return;
    }

    setBusy(true);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) throw error;
      
      // Determine role for instant redirect
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      const userRole = roleData?.role;
      toast.success("Signed in successfully");

      if (userRole === "student") {
        await navigate({ to: "/student/portal" as any, replace: true });
      } else if (userRole === "professor") {
        await navigate({ to: "/professor/portal" as any, replace: true });
      } else {
        await navigate({ to: "/dashboard", replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{UNIVERSITY_NAME}</p>
            <p className="text-xs text-muted-foreground">Examination & Academic Portal</p>
          </div>
        </div>

        <div className="panel p-6 shadow-sm border border-border rounded-xl bg-card text-card-foreground">
          <div className="mb-5 space-y-1">
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Lock className="size-4 text-primary" /> Examination Suite Sign In
            </h1>
            <p className="text-xs text-muted-foreground">
              Sign in with your Admin, Professor, or Student credentials.
            </p>
          </div>

          {/* Quick 1-Click Instant Sign-In */}
          <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                ⚡ 1-Click Instant Login:
              </p>
              <span className="text-[10px] text-muted-foreground font-mono">Click any role to enter</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void loginWithCredentials("admin@exam.com", "Admin@123456", "Admin")}
                className="group relative flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card p-2 text-xs font-medium text-foreground hover:border-primary hover:bg-primary/10 transition-all duration-200 text-center cursor-pointer shadow-xs disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  {oneClickTarget === "Admin" ? (
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                  ) : (
                    <span>🛡️</span>
                  )}
                  <span>Admin</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-full">
                  admin@exam.com
                </span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void loginWithCredentials("prof@exam.com", "Prof@123456", "Professor")}
                className="group relative flex flex-col items-center justify-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs font-medium text-foreground hover:border-emerald-500 hover:bg-emerald-500/10 transition-all duration-200 text-center cursor-pointer shadow-xs disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  {oneClickTarget === "Professor" ? (
                    <Loader2 className="size-3.5 animate-spin text-emerald-600" />
                  ) : (
                    <span>👨‍🏫</span>
                  )}
                  <span>Rajesh Sir</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-full">
                  prof@exam.com
                </span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void loginWithCredentials("student@exam.com", "Student@123456", "Student")}
                className="group relative flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card p-2 text-xs font-medium text-foreground hover:border-primary hover:bg-primary/10 transition-all duration-200 text-center cursor-pointer shadow-xs disabled:opacity-50"
              >
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  {oneClickTarget === "Student" ? (
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                  ) : (
                    <span>🎓</span>
                  )}
                  <span>Student</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-full">
                  student@exam.com
                </span>
              </button>
            </div>

            <div className="rounded-lg bg-card/60 p-2 border border-border/60 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Default Password for all:</span>{" "}
              <code className="text-primary font-mono font-semibold">Admin@123456</code> / <code className="text-emerald-600 font-mono font-semibold">Prof@123456</code>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold text-foreground">Email / ID</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@exam.com"
                className="rounded-lg border-border"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold text-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="rounded-lg border-border"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Sign In to Portal
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Role is automatically verified to redirect to your dedicated dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}