import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, MessagesSquare, LogOut } from "lucide-react";
import { useAuth } from "../../../lib/auth";
import { cn } from "../../../lib/utils";
import { ProfileAvatar } from "../../onsite-nursing-officer/lib/ProfileAvatar";

const BASE = "/dashboard/virtual-medical-officer";
const NAV = [
  { to: BASE, label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: `${BASE}/inbox`, label: "Side-Effect Inbox", icon: MessagesSquare },
] as const;

// Desktop shell. The sidebar is deliberately absent during the triage checklist: that flow is a lock-in on
// purpose (friction as safety), so there is no navigation to wander off to mid-question.
export function VmoLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const suppressed = pathname.startsWith(`${BASE}/triage/`);

  return (
    <div className="flex h-screen overflow-hidden bg-admin-canvas-bg font-public-sans">
      {!suppressed && (
        <aside className="flex h-full w-64 shrink-0 flex-col border-r border-admin-border bg-white">
          <div className="flex items-center gap-3 px-6 py-5">
            <img src="/oncoflow-logo.svg" alt="" className="size-8" />
            <div>
              <p className="text-admin-body-sm font-bold text-admin-text">ONCOFLOW</p>
              <p className="text-admin-caption text-admin-text-secondary">Clinical Portal</p>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-2 py-2">
            {NAV.map(({ to, label, icon: Icon, ...rest }) => (
              <NavLink
                key={to} to={to} end={"end" in rest}
                className={({ isActive }) => cn(
                  "flex h-12 items-center gap-3 rounded-admin-sm px-4 text-admin-body-sm",
                  isActive ? "bg-admin-gold font-bold text-admin-gold-text" : "text-admin-text-secondary hover:bg-admin-card-alt",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-admin-border px-4 py-4">
            <div className="flex items-center gap-3">
              <ProfileAvatar user={user} className="size-10 text-admin-body-sm" />
              <div className="min-w-0">
                <p className="truncate text-admin-body-sm font-semibold text-admin-text">{user?.fullName}</p>
                <p className="text-admin-caption text-admin-text-secondary">Virtual Medical Officer</p>
              </div>
            </div>
            <button onClick={() => logout()} className="mt-3 flex items-center gap-2 text-admin-body-sm text-admin-text-secondary hover:text-admin-text">
              <LogOut className="size-4" aria-hidden="true" /> Sign out
            </button>
          </div>
        </aside>
      )}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto"><Outlet /></main>
    </div>
  );
}
