import type { FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { Bell, Search } from "lucide-react";
import { cn } from "../../../lib/utils";

interface TopAppBarProps {
  title: string;
  region: string | null;
  facilityCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (e: FormEvent) => void;
  connected: boolean;
  hasAlerts: boolean;
  profileInitials: string;
}

// Phase 1 shared top bar — one instance, content varies only via props. Height, colors and
// radii are the locked `admin-*` tokens; nothing here is a hardcoded hex/px value.
//
// The "System Online" pill is real, not decorative: it reflects whether this session's own
// facility-scope load actually succeeded, the same signal the old bare radio-icon indicator
// used — this app has no real infrastructure-health signal to report, so the pill says
// "connected" (true) rather than a fabricated "Optimal".
export function TopAppBar({
  title, region, facilityCount, search, onSearchChange, onSearchSubmit, connected, hasAlerts, profileInitials,
}: TopAppBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-admin-border bg-admin-page-bg px-8">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-admin-h2 text-admin-text">{title}</h1>
        {region && (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-admin-sm border border-admin-border bg-admin-card-alt px-2.5 py-1 text-admin-caption font-medium text-admin-text-secondary lg:flex">
            {region} ({facilityCount} {facilityCount === 1 ? "facility" : "facilities"})
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <form onSubmit={onSearchSubmit} className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-admin-text-secondary" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search patients, IDs…"
            className="w-64 rounded-admin-lg border border-admin-border bg-admin-card-alt py-1.5 pl-9 pr-3 text-admin-body-sm text-admin-text placeholder:text-admin-text-secondary focus:border-admin-sidebar-cta focus:outline-none focus:ring-1 focus:ring-admin-sidebar-cta"
          />
        </form>

        <span className="hidden items-center gap-1.5 rounded-admin-lg bg-admin-disabled px-2.5 py-1 text-admin-caption font-medium text-admin-text sm:flex">
          <span className={cn("size-1.5 rounded-full", connected ? "bg-admin-success" : "bg-admin-text-secondary")} aria-hidden="true" />
          {connected ? "System Online" : "Reconnecting…"}
        </span>

        <NavLink to="/dashboard/regional-admin/notifications" className="relative rounded-admin-sm p-1.5 text-admin-text-secondary hover:bg-admin-card-alt hover:text-admin-text">
          <Bell className="size-4.5" aria-hidden="true" />
          {hasAlerts && (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-admin-danger ring-2 ring-admin-page-bg" aria-hidden="true" />
          )}
        </NavLink>

        <NavLink to="/dashboard/regional-admin/settings" className="flex items-center gap-2 rounded-admin-lg py-1 pl-1 pr-3 hover:bg-admin-card-alt">
          <div className="flex size-8 items-center justify-center rounded-full bg-admin-card-alt text-admin-caption font-semibold text-admin-text">
            {profileInitials}
          </div>
          <span className="hidden text-admin-body-sm font-medium text-admin-text sm:inline">Profile</span>
        </NavLink>
      </div>
    </header>
  );
}
