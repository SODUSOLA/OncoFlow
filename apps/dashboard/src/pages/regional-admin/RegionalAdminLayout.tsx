import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutGrid, Search, CalendarClock, CalendarRange, Receipt, Package, MessageSquare, Lock,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "../../lib/auth";
import { cn } from "../../lib/utils";
import { useRegionScope } from "./lib/useRegionScope";

// Regional Admin's own shell — deliberately separate from the shared, minimal `DashboardLayout`
// that every other role still uses (see App.tsx). Rebuilt against the "Regional Admin Dashboard
// Design" artifact, which is the structural blueprint for this role: dark sidebar, hairline
// cards, no CTA button or search/bell in the chrome.
const NAV_ITEMS = [
  { to: "/dashboard/regional-admin", label: "Region Overview", icon: LayoutGrid, end: true, eyebrow: null, title: "Region Overview" },
  { to: "/dashboard/regional-admin/patient-search", label: "Patient Search", icon: Search, end: false, eyebrow: "Patient Operations", title: "Patient Search" },
  { to: "/dashboard/regional-admin/countdown", label: "7-Day Countdown", icon: CalendarClock, end: false, eyebrow: "Care navigation", title: "7-Day Pre-Chemo Countdown" },
  { to: "/dashboard/regional-admin/scheduling", label: "Scheduling & Transfers", icon: CalendarRange, end: false, eyebrow: "Care navigation", title: "Scheduling & Facility Transfers" },
  { to: "/dashboard/regional-admin/billing", label: "Billing", icon: Receipt, end: false, eyebrow: "Billing", title: "Invoices & Payments" },
  { to: "/dashboard/regional-admin/inventory", label: "Inventory", icon: Package, end: false, eyebrow: "Inventory", title: "Movements & Reconciliation" },
  { to: "/dashboard/regional-admin/inquiry", label: "General Inquiry", icon: MessageSquare, end: false, eyebrow: "Messaging", title: "General Inquiry Desk" },
] as const;

// RBAC walls that are correctly zero-interaction for this role (18-admin-feature-status-workflow-
// pairing.md's "correctly zero" findings for QA/Clinical/payout content) — shown, not hidden, so
// the boundary reads as intentional rather than an accidental missing feature.
const NOT_PERMITTED_ITEMS = ["Clinical Records", "Physical Case Board", "Payouts & Disbursement"];

const SIDEBAR_COLLAPSED_KEY = "ra-sidebar-collapsed";

export function RegionalAdminLayout() {
  const { user, roles, logout } = useAuth();
  const location = useLocation();
  const { region, facilitiesInRegion } = useRegionScope();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  const activeItem = NAV_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  ) ?? NAV_ITEMS[0];
  const eyebrow = activeItem.eyebrow ?? (region ? `${region} Region` : "Region Overview");

  const roleLabel = roles[0]?.roleDescription || roles[0]?.roleName.replace(/_/g, " ") || "Regional Admin";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className={cn("flex shrink-0 flex-col bg-ink-600 text-white transition-[width] duration-150", collapsed ? "w-16" : "w-64")}>
        <div className={cn("flex items-center pt-6", collapsed ? "justify-center px-2" : "justify-between px-6")}>
          {!collapsed && (
            <div>
              <p className="text-lg font-bold tracking-tight text-white">ONCOFLOW LIMITED</p>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Regional Operations</p>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
          </button>
        </div>

        <nav className={cn("mt-8 flex flex-col gap-0.5", collapsed ? "px-2" : "px-4")}>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-2",
                  isActive ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white/90",
                )
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>

        <div className={cn("mt-6", collapsed ? "px-2" : "px-4")}>
          {!collapsed && <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">Not permitted</p>}
          <div className="mt-1 flex flex-col gap-0.5">
            {NOT_PERMITTED_ITEMS.map((label) => (
              <div
                key={label}
                title={collapsed ? `${label} — restricted, outside this role's RBAC scope` : "Restricted — outside this role's RBAC scope"}
                className={cn(
                  "flex cursor-not-allowed items-center gap-2.5 rounded px-3 py-1.5 text-sm text-white/25",
                  collapsed && "justify-center px-2",
                )}
              >
                <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                {!collapsed && label}
              </div>
            ))}
          </div>
        </div>

        <div className={cn("mt-auto flex flex-col gap-0.5 border-t border-white/10 py-4", collapsed ? "items-center px-2" : "px-6")}>
          {collapsed ? (
            <div title={`${user?.email.split("@")[0]} · ${roleLabel}${region ? ` · ${region}` : ""}`} className="flex size-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
              {user?.email.slice(0, 2).toUpperCase()}
            </div>
          ) : (
            <>
              <p className="truncate text-sm font-medium text-white">{user?.email.split("@")[0]}</p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-white/40">{roleLabel}{region ? ` · ${region}` : ""}</p>
                <button onClick={() => logout()} className="text-xs text-white/40 hover:text-white">
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-8 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{eyebrow}</p>
            <h1 className="text-2xl font-bold text-gray-900">{activeItem.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">
              <span className="size-1.5 rounded-full bg-blue-600" aria-hidden="true" />
              Region scope · {region ?? "—"} ({facilitiesInRegion.length} {facilitiesInRegion.length === 1 ? "facility" : "facilities"})
            </span>
            <span className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-400">Read scope: operational only</span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
