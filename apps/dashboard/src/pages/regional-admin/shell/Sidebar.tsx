import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import { Lock, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface SidebarNavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

interface SidebarProps {
  navItems: readonly SidebarNavItem[];
  comingSoonItems: readonly SidebarNavItem[];
  notPermittedLabels: readonly string[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  userName: string;
  userSubtitle: string;
  initials: string;
  onSignOut: () => void;
}

// Phase 1 of ONCOFLOW_REGIONAL_ADMIN_BUILD_GUIDE.md — a single reusable instance mounted once by
// RegionalAdminLayout, not duplicated per screen. Every color/radius value below is one of the
// locked `admin-*` design tokens (see ONCOFLOW_DESIGN_SYSTEM.md); none are hardcoded hex/px.
//
// The spec's "New Consultation" CTA is deliberately not rendered here — it opens Clinical Chat,
// which this role has no backend access to (file:read is SUPER_ADMIN-only) and no route for.
// Confirmed with the user when these docs were introduced: keep it dropped rather than build a
// button with nowhere to go, same call made before this doc existed.
export function Sidebar({
  navItems, comingSoonItems, notPermittedLabels, collapsed, onToggleCollapsed,
  userName, userSubtitle, initials, onSignOut,
}: SidebarProps) {
  return (
    <aside className={cn("flex h-full shrink-0 flex-col border-r border-admin-border bg-white transition-[width] duration-150", collapsed ? "w-16" : "w-64")}>
      <div className={cn("flex items-center gap-2.5", collapsed ? "justify-center px-2 py-6" : "justify-between p-6")}>
        {!collapsed ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/oncoflow-logo.svg" alt="" className="size-8 shrink-0" />
            <div className="min-w-0">
              <p className="text-admin-body-sm font-bold leading-tight text-admin-text">ONCOFLOW LIMITED</p>
              <p className="truncate text-admin-body-sm font-semibold text-admin-text">Oncology Portal</p>
            </div>
          </div>
        ) : (
          <img src="/oncoflow-logo.svg" alt="" className="size-7 shrink-0" />
        )}
        {!collapsed && (
          <button onClick={onToggleCollapsed} title="Collapse sidebar" className="shrink-0 rounded-admin-sm p-1.5 text-admin-text-secondary hover:bg-admin-card-alt">
            <PanelLeftClose className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {collapsed && (
        <button onClick={onToggleCollapsed} title="Expand sidebar" className="mx-auto mt-3 rounded-admin-sm p-1.5 text-admin-text-secondary hover:bg-admin-card-alt">
          <PanelLeftOpen className="size-4" aria-hidden="true" />
        </button>
      )}

      <nav className={cn("mt-4 flex flex-col gap-1", collapsed ? "px-2" : "px-4")}>
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "flex h-11 items-center gap-2.5 rounded-admin-sm px-4 py-3 text-admin-body-sm font-medium",
                collapsed && "justify-center px-2",
                isActive ? "bg-admin-gold text-admin-gold-text" : "text-admin-text hover:bg-admin-card-alt",
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {!collapsed && label}
          </NavLink>
        ))}

        {!collapsed && <div className="my-2 border-t border-admin-border" />}
        {comingSoonItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "flex h-11 items-center gap-2.5 rounded-admin-sm px-4 py-3 text-admin-body-sm font-medium",
                collapsed && "justify-center px-2",
                isActive ? "bg-admin-gold text-admin-gold-text" : "text-admin-text hover:bg-admin-card-alt",
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      <div className={cn("mt-6", collapsed ? "px-2" : "px-4")}>
        {!collapsed && <p className="px-3 text-admin-micro font-semibold uppercase tracking-widest text-admin-text-secondary">Not permitted</p>}
        <div className="mt-1 flex flex-col gap-0.5">
          {notPermittedLabels.map((label) => (
            <div
              key={label}
              title={collapsed ? `${label} — restricted, outside this role's RBAC scope` : "Restricted — outside this role's RBAC scope"}
              className={cn("flex h-9 cursor-not-allowed items-center gap-2.5 rounded-admin-sm px-4 text-admin-body-sm text-admin-text-secondary/60", collapsed && "justify-center px-2")}
            >
              <Lock className="size-3.5 shrink-0" aria-hidden="true" />
              {!collapsed && label}
            </div>
          ))}
        </div>
      </div>

      <div className={cn("mt-auto flex flex-col gap-0.5 border-t border-admin-border py-4", collapsed ? "items-center px-2" : "px-4")}>
        {collapsed ? (
          <div title={`${userName} · ${userSubtitle}`} className="flex size-8 items-center justify-center rounded-full bg-admin-card-alt text-admin-caption font-semibold text-admin-text">
            {initials}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-admin-card-alt text-admin-caption font-semibold text-admin-text">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-admin-caption font-normal text-admin-text">{userName}</p>
                <p className="truncate text-admin-micro text-admin-text-secondary">{userSubtitle}</p>
              </div>
            </div>
            <button onClick={onSignOut} className="mt-2 self-start text-admin-micro text-admin-text-secondary hover:text-admin-text">
              Sign out
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
