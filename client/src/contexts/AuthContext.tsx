import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { useUser, useClerk } from "@clerk/react";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  isSystemAdmin: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  updateProfile: (displayName: string | null) => Promise<{ success: boolean; error?: string }>;
  // Kept for API compatibility — auth is now handled by Clerk's UI
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { signOut } = useClerk();
  const [localUser, setLocalUser] = useState<AuthUser | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const prevClerkUserIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!clerkLoaded) return;

    if (!clerkUser) {
      setLocalUser(null);
      setLocalLoading(false);
      prevClerkUserIdRef.current = undefined;
      return;
    }

    // Only re-fetch if the Clerk user ID actually changed
    if (prevClerkUserIdRef.current === clerkUser.id) return;
    prevClerkUserIdRef.current = clerkUser.id;

    setLocalLoading(true);
    fetch("/api/auth/user", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => setLocalUser(data?.user ?? null))
      .catch(() => setLocalUser(null))
      .finally(() => setLocalLoading(false));
  }, [clerkUser?.id, clerkLoaded]);

  const logout = async () => {
    await signOut();
    setLocalUser(null);
    prevClerkUserIdRef.current = undefined;
    // Clear legacy cookie if present (no-op if not set)
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  };

  const login = async (_email: string, _password: string): Promise<{ success: boolean; error?: string }> => {
    // Email/password is now handled by Clerk's <SignIn> component
    return { success: false, error: "Please use the sign-in form" };
  };

  const register = async (_email: string, _password: string, _displayName?: string): Promise<{ success: boolean; error?: string }> => {
    // Registration is now handled by Clerk's <SignUp> component
    return { success: false, error: "Please use the sign-up form" };
  };

  const updateProfile = async (displayName: string | null): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName }),
      });
      const data = await res.json();
      if (res.ok) {
        setLocalUser(data.user);
        return { success: true };
      }
      return { success: false, error: data.error || "Failed to update profile" };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  return (
    <AuthContext.Provider value={{
      user: localUser,
      isLoading: !clerkLoaded || localLoading,
      login,
      register,
      logout,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
