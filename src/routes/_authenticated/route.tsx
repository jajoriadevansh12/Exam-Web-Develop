import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;

    if (!session) {
      void navigate({ to: "/auth", replace: true });
      return;
    }

    if (role === "student" && !pathname.startsWith("/student")) {
      void navigate({ to: "/student/portal" as any, replace: true });
      return;
    }

    if (role === "professor" && !pathname.startsWith("/professor/portal")) {
      void navigate({ to: "/professor/portal" as any, replace: true });
      return;
    }
  }, [loading, session, role, pathname, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <Outlet />;
}