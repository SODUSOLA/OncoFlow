import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  status: string;
  facilityId: string | null;
}

export interface AuthRole {
  id: string;
  roleId: string;
  roleName: string;
  roleDescription: string;
}

interface AuthState {
  user: AuthUser | null;
  roles: AuthRole[];
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, roles: [], loading: true });

  // Checks for an existing session cookie on load — /auth/profile is the only endpoint that
  // both requires just being logged in (not a specific permission grant) and tells us who
  // that is, so a page refresh doesn't silently drop back to the login screen.
  useEffect(() => {
    api.get<{ user: AuthUser; roles: AuthRole[] }>("/auth/profile")
      .then(({ user, roles }) => setState({ user, roles, loading: false }))
      .catch(() => setState({ user: null, roles: [], loading: false }));
  }, []);

  async function login(email: string, password: string) {
    const result = await api.post<{ user: AuthUser; roles: AuthRole[] }>("/auth/login", { email, password });
    setState({ user: result.user, roles: result.roles, loading: false });
  }

  async function logout() {
    await api.post("/auth/logout").catch(() => { /* clear local state regardless */ });
    setState({ user: null, roles: [], loading: false });
  }

  return <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
