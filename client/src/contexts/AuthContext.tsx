import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  isSystemAdmin: boolean;
  /** False for accounts that only sign in with Google (no BTM password set yet) */
  hasPassword?: boolean;
}

type Outcome = { success: boolean; error?: string };

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<Outcome>;
  register: (email: string, password: string, displayName?: string) => Promise<Outcome>;
  loginWithGoogle: (credential: string) => Promise<Outcome>;
  requestPasswordReset: (email: string) => Promise<Outcome>;
  resetPassword: (token: string, password: string) => Promise<Outcome>;
  logout: () => Promise<void>;
  updateProfile: (displayName: string | null) => Promise<Outcome>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function postJson(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Who is signed in? (The session lives in an http-only cookie set by the server.)
  const refreshUser = () =>
    fetch("/api/auth/user", { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(data => setUser(data?.user ?? null))
      .catch(() => setUser(null));

  useEffect(() => {
    refreshUser().finally(() => setIsLoading(false));
  }, []);

  // A different person may now be signed in, so drop any cached data
  const signedIn = (u: AuthUser) => {
    queryClient.clear();
    setUser(u);
  };

  const authCall = async (url: string, body: unknown, fallbackError: string): Promise<Outcome> => {
    try {
      const { ok, data } = await postJson(url, body);
      if (ok && data.user) {
        signedIn(data.user);
        return { success: true };
      }
      return { success: false, error: data.error || fallbackError };
    } catch {
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const login = (email: string, password: string) =>
    authCall("/api/auth/login", { email, password }, "Invalid email or password.");

  const register = (email: string, password: string, displayName?: string) =>
    authCall("/api/auth/register", { email, password, displayName }, "Could not create account.");

  const loginWithGoogle = (credential: string) =>
    authCall("/api/auth/google", { credential }, "Google sign-in failed.");

  const resetPassword = (token: string, password: string) =>
    authCall("/api/auth/reset", { token, password }, "Could not reset password.");

  const requestPasswordReset = async (email: string): Promise<Outcome> => {
    try {
      const { ok, data } = await postJson("/api/auth/forgot", { email });
      return ok ? { success: true } : { success: false, error: data.error || "Could not send reset email." };
    } catch {
      return { success: false, error: "Network error. Please try again." };
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    queryClient.clear();
    setUser(null);
  };

  const updateProfile = async (displayName: string | null): Promise<Outcome> => {
    try {
      const { ok, data } = await postJson("/api/auth/profile", { displayName }, "PATCH");
      if (ok) {
        setUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error || "Failed to update profile" };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, loginWithGoogle, requestPasswordReset, resetPassword, logout, updateProfile, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
