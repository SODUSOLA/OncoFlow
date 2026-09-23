import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { invalidateRegionScope } from "../pages/regional-admin/lib/facilityStore";

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
  login: (email: string, password: string) => Promise<{ user: AuthUser; roles: AuthRole[] }>;
  logout: () => Promise<void>;
}

// React context holding the current session.
const AuthContext = createContext<AuthContextValue | null>(null);

// Provides the session (user and roles) and login/logout to the app.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, roles: [], loading: true });

  // Restores an existing session on load via /auth/profile, so a refresh doesn't drop back to the login screen.
  useEffect(() => {
    api.get<{ user: AuthUser; roles: AuthRole[] }>("/auth/profile")
      .then(({ user, roles }) => setState({ user, roles, loading: false }))
      .catch(() => setState({ user: null, roles: [], loading: false }));
  }, []);

  // Returns the authenticated identity so the caller can refuse accounts this app shouldn't accept, such as patients.
  async function login(email: string, password: string) {
    const result = await api.post<{ user: AuthUser; roles: AuthRole[] }>("/auth/login", { email, password });
    setState({ user: result.user, roles: result.roles, loading: false });
    return result;
  }

  // Ends the session and clears local state even if the API call fails.
  async function logout() {
    await api.post("/auth/logout").catch(() => { /* clear local state regardless */ });
    // Clears the module-level facility cache, which outlives this provider, so a long-lived tab doesn't serve the previous session's data.
    invalidateRegionScope();
    setState({ user: null, roles: [], loading: false });
  }

  return <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>;
}

// Returns the auth context, throwing outside an AuthProvider.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
