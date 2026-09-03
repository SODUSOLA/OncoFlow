import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { dashboardPathForRoles, hasStaffAccess } from "../lib/roleRouting";

export default function Login() {
  const { user, roles, loading, login, logout } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleNames = roles.map((r) => r.roleName);
  const signedInWithoutStaffAccess = !loading && !!user && !hasStaffAccess(roleNames);

  if (!loading && user && !signedInWithoutStaffAccess) {
    const from = (location.state as { from?: string } | null)?.from;
    const path = dashboardPathForRoles(roleNames);
    return <Navigate to={from ?? (path ? `/dashboard/${path}` : "/no-dashboard")} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await login(email, password);
      // A patient account authenticates perfectly well — it is simply not for this app. Undo
      // the session it just created so signing in here never leaves a live staff-portal
      // session behind, and say plainly why it was refused.
      if (!hasStaffAccess(result.roles.map((r) => r.roleName))) {
        await logout();
        setError("This is the staff portal. Patient accounts sign in through the patient app.");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img src="/oncoflow-logo.svg" alt="OncoFlow Limited" className="size-12" />
          <p className="mt-3 text-lg font-bold tracking-tight text-ink">ONCOFLOW LIMITED</p>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Staff Portal</p>
        </div>

        {signedInWithoutStaffAccess ? (
          // A patient session reaches this app on its own because the session cookie is scoped
          // to the hostname and cookies ignore the port. Rather than a bare form the account
          // can never get past, say what happened and offer the way out.
          <div className="space-y-4 rounded border border-gray-200 bg-white p-6 text-center">
            <h1 className="text-base font-semibold text-gray-900">Staff access only</h1>
            <p className="text-sm text-gray-500">
              You are signed in as <span className="font-medium text-gray-700">{user?.email}</span>,
              which is a patient account. Sign out to use a staff account here.
            </p>
            <button
              type="button"
              onClick={() => logout()}
              className="w-full rounded bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-600"
            >
              Sign out
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded border border-gray-200 bg-white p-6">
          <div className="mb-2 text-center">
            <h1 className="text-base font-semibold text-gray-900">Sign in to your dashboard</h1>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-600 disabled:opacity-50"
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          Staff and clinician access only.
        </p>
      </div>
    </div>
  );
}
