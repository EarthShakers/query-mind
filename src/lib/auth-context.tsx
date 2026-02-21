"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

interface SpaceMembership {
  spaceId: string;
  spaceName: string;
  role: "admin" | "editor" | "viewer";
  isDefault: boolean;
}

interface AuthUser {
  userId: string;
  email: string;
  role: "admin" | "user";
  tenantId: string;
  displayName: string | null;
  tenantRole: "admin" | "member" | null;
  spaces: SpaceMembership[];
  activeSpaceId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  switchSpace: (spaceId: string) => Promise<void>;
  activeSpace: SpaceMembership | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  logout: async () => {},
  refresh: async () => {},
  switchSpace: async () => {},
  activeSpace: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  }, []);

  const switchSpace = useCallback(async (spaceId: string) => {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/switch`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {
      // ignore
    }
  }, []);

  const activeSpace = useMemo(() => {
    if (!user?.activeSpaceId || !user.spaces.length) return null;
    return user.spaces.find((s) => s.spaceId === user.activeSpaceId) ?? null;
  }, [user]);

  return (
    <AuthContext.Provider
      value={{ user, loading, logout, refresh, switchSpace, activeSpace }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
