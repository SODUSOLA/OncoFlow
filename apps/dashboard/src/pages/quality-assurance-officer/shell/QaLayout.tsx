import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../../lib/auth";

// Simple shell for the QA Officer: a header and the routed page. No sidebar or tabs — the only real work
// here is the pending-review queue and reviewing one case at a time, not enough surfaces yet to warrant one.
export function QaLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.email.slice(0, 2) ?? "QA").toUpperCase();

  // Signs out and returns to login.
  async function signOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-admin-canvas-bg font-public-sans">
      <header className="flex items-center justify-between border-b border-admin-border bg-white px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <img src="/oncoflow-logo.svg" alt="" className="size-8 shrink-0" />
          <div>
            <p className="text-admin-body-sm font-bold leading-tight text-admin-text">ONCOFLOW</p>
            <p className="text-admin-micro leading-tight text-admin-text-secondary">Quality Assurance</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-admin-caption text-admin-text-secondary">{user?.email}</span>
          <button onClick={signOut} title="Sign out" className="flex size-8 items-center justify-center rounded-full bg-admin-card-alt text-admin-caption font-semibold text-admin-text hover:bg-admin-border">
            {initials}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
