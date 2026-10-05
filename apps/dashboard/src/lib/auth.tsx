import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, SESSION_EXPIRED_EVENT } from "./api";
import { invalidateRegionScope } from "../pages/regional-admin/lib/facilityStore";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  // First + last name, or the email's local part when no name is on record.
  fullName: string;
  profilePictureFileId: string | null;
  mfaEnabled: boolean;
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
  // Set when a signed-in session is rejected by the server, so the login page can say why the user was sent back.
  sessionExpired: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<{ user: AuthUser; roles: AuthRole[] }>;
  logout: () => Promise<void>;
  // Replaces the cached user after the caller changed their own profile (e.g. new profile image).
  updateUser: (user: AuthUser) => void;
}

// React context holding the current session.
const AuthContext = createContext<AuthContextValue | null>(null);

// Provides the session (user and roles) and login/logout to the app.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, roles: [], loading: true, sessionExpired: false });

  // Restores an existing session on load via /auth/profile, so a refresh doesn't drop back to the login screen.
  useEffect(() => {
    api.get<{ user: AuthUser; roles: AuthRole[] }>("/auth/profile")
      .then(({ user, roles }) => setState({ user, roles, loading: false, sessionExpired: false }))
      .catch(() => setState({ user: null, roles: [], loading: false, sessionExpired: false }));
  }, []);

  // The API client reports a 401 on any authenticated call; dropping the user here sends the protected routes to /login.
  useEffect(() => {
    function onExpired() {
      setState((prev) => (prev.user ? { user: null, roles: [], loading: false, sessionExpired: true } : prev));
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Returns the authenticated identity so the caller can refuse accounts this app shouldn't accept, such as patients.
  async function login(email: string, password: string) {
    const result = await api.post<{ user: AuthUser; roles: AuthRole[] }>("/auth/login", { email, password });
    setState({ user: result.user, roles: result.roles, loading: false, sessionExpired: false });
    return result;
  }

  // Ends the session and clears local state even if the API call fails.
  async function logout() {
    await api.post("/auth/logout").catch(() => { /* clear local state regardless */ });
    // Clears the module-level facility cache, which outlives this provider, so a long-lived tab doesn't serve the previous session's data.
    invalidateRegionScope();
    // Unsent documentation drafts are per person; don't leave them on a shared device after sign-out.
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("oncoflow.docDraft.")).forEach((k) => localStorage.removeItem(k));
    } catch { /* storage unavailable — nothing to clear */ }
    setState({ user: null, roles: [], loading: false, sessionExpired: false });
  }

  // Swaps in a freshly-returned user without touching roles or the loading flag.
  function updateUser(user: AuthUser) {
    setState((prev) => ({ ...prev, user }));
  }

  return <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>{children}</AuthContext.Provider>;
}

// Returns the auth context, throwing outside an AuthProvider.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
