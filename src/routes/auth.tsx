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

  function fillDemo(demoEmail: string, demoPass: string) {
    setEmail(demoEmail);
    setPassword(demoPass);
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

          {/* Quick Demo Credentials */}
          <div className="mb-5 rounded-xl border border-border bg-secondary/50 p-3">
            <p className="text-xs font-semibold text-foreground mb-2">⚡ Quick 1-Click Demo Accounts:</p>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => fillDemo("admin@exam.com", "Admin@123456")}
                className="rounded-full border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:bg-accent transition-all duration-200 text-center cursor-pointer shadow-xs"
              >
                🛡️ Admin
              </button>
              <button
                type="button"
                onClick={() => fillDemo("prof@exam.com", "Prof@123456")}
                className="rounded-full border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:bg-accent transition-all duration-200 text-center cursor-pointer shadow-xs"
              >
                👨‍🏫 Professor
              </button>
              <button
                type="button"
                onClick={() => fillDemo("student@exam.com", "Student@123456")}
                className="rounded-full border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary hover:bg-accent transition-all duration-200 text-center cursor-pointer shadow-xs"
              >
                🎓 Student
              </button>
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