import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "staff" | "professor" | "student";

type AuthState = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  profile: { full_name?: string | null; email?: string | null } | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refetchRole: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<{ full_name?: string | null; email?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const queryClient = useQueryClient();

  const fetchUserDetails = useCallback(async (userId: string) => {
    try {
      const [roleRes, profRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
      ]);

      if (roleRes.data?.role) {
        setRole(roleRes.data.role as AppRole);
      } else {
        setRole("admin"); // Fallback
      }

      if (profRes.data) {
        setProfile(profRes.data);
      }
    } catch {
      setRole("admin");
    }
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        void fetchUserDetails(nextSession.user.id).finally(() => setLoading(false));
      } else {
        setRole(null);
        setProfile(null);
        setLoading(false);
      }
      void router.invalidate();
    });

    supabase.auth
      .getSession()
      .then(async ({ data: sessionData }) => {
        const currentSession = sessionData?.session ?? null;
        setSession(currentSession);
        if (currentSession?.user) {
          await fetchUserDetails(currentSession.user.id);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    return () => data?.subscription?.unsubscribe();
  }, [router, fetchUserDetails]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      role,
      profile,
      loading,
      refetchRole: async () => {
        if (session?.user) {
          await fetchUserDetails(session.user.id);
        }
      },
      signOut: async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
        setRole(null);
        setProfile(null);
        window.location.assign("/auth");
      },
    }),
    [session, role, profile, loading, queryClient, fetchUserDetails],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}