import type { ComponentType } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { CalendarClock, UploadCloud, Users, Package } from "lucide-react";
import { useAuth } from "../../../lib/auth";
import { cn } from "../../../lib/utils";

// ONCOFLOW_NURSING_OFFICER_BUILD_GUIDE.md — "Mobile-first responsive web... same stack as
// every other persona, not a separate app." A max-width mobile frame (rather than a desktop
// admin shell like Regional Admin/Consultant) with a 4-tab bottom nav, since that's the actual
// interaction model this persona's screens use — a nurse walking a ward with a phone/tablet,
// not someone at a desk with a sidebar.
interface Tab { to: string; label: string; icon: ComponentType<{ className?: string }>; end?: boolean }
const TABS: readonly Tab[] = [
  { to: "/dashboard/onsite-nursing-officer", label: "Schedule", icon: CalendarClock, end: true },
  { to: "/dashboard/onsite-nursing-officer/uploads", label: "Uploads", icon: UploadCloud },
  { to: "/dashboard/onsite-nursing-officer/patients", label: "Patients", icon: Users },
  { to: "/dashboard/onsite-nursing-officer/inventory", label: "Inventory", icon: Package },
];

export function NursingLayout() {
  const { user, logout } = useAuth();
  const initials = (user?.email.slice(0, 2) ?? "NO").toUpperCase();

  return (
    <div className="flex h-screen justify-center bg-admin-canvas-bg font-public-sans">
      <div className="flex h-full w-full max-w-md flex-col bg-admin-page-bg shadow-admin-card">
        <header className="flex shrink-0 items-center justify-between border-b border-admin-border bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/oncoflow-logo.svg" alt="" className="size-7 shrink-0" />
            <div>
              <p className="text-admin-caption font-bold leading-tight text-admin-text">ONCOFLOW</p>
              <p className="text-admin-micro leading-tight text-admin-text-secondary">Nursing Officer</p>
            </div>
          </div>
          <button onClick={() => logout()} title="Sign out" className="flex size-8 items-center justify-center rounded-full bg-admin-card-alt text-admin-caption font-semibold text-admin-text">
            {initials}
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>

        <nav className="grid shrink-0 grid-cols-4 border-t border-admin-border bg-white">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 py-2.5 text-admin-micro font-medium",
                  isActive ? "text-admin-sidebar-cta" : "text-admin-text-secondary",
                )
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
