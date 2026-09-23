import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import { Plus, Download, LogOut } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface ConsultantNavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

export interface PatientContext {
  id: string;
  displayId: string;
  name: string;
  initials: string;
}

interface SidebarProps {
  navItems: readonly ConsultantNavItem[];
  patientContext: PatientContext | null;
  onAddClinicalNote: () => void;
  onExit: () => void;
}

// Separate from Regional Admin's sidebar: a different background and active-nav style plus a patient context card, sharing only the admin-* tokens.
export function Sidebar({ navItems, patientContext, onAddClinicalNote, onExit }: SidebarProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-admin-border bg-admin-card-alt">
      <div className="border-b border-admin-border bg-white px-6 py-4">
        {patientContext ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-admin-md bg-admin-sidebar-cta text-admin-body-sm font-semibold text-white">
                {patientContext.initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-admin-body text-admin-text">{patientContext.name}</p>
                <p className="truncate text-admin-caption text-admin-text-secondary">ID: {patientContext.displayId}</p>
              </div>
            </div>
            <button
              onClick={onAddClinicalNote}
              className="flex w-full items-center justify-center gap-2 rounded-admin-lg bg-admin-sidebar-cta px-4 py-2.5 text-admin-body-sm text-white hover:bg-admin-sidebar-cta/90"
            >
              <Plus className="size-3.5" aria-hidden="true" /> Add Clinical Note
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-admin-md border border-dashed border-admin-border text-admin-text-secondary">
              <Plus className="size-4 opacity-0" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-admin-body text-admin-text">No patient selected</p>
              <p className="truncate text-admin-caption text-admin-text-secondary">Open a consult or Patient File</p>
            </div>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex h-12 items-center gap-3 rounded-admin-sm px-4 text-admin-body-sm",
                isActive
                  ? "border-r-4 border-admin-gold-text bg-admin-disabled-alt font-bold text-admin-text"
                  : "text-admin-text-secondary hover:bg-white/60",
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-admin-border px-2 py-4">
        <button className="flex w-full items-center gap-3 rounded-admin-sm px-4 py-2 text-admin-caption text-admin-text-secondary hover:bg-white/60">
          <Download className="size-3.5" aria-hidden="true" /> Secure Export
        </button>
        <button onClick={onExit} className="flex w-full items-center gap-3 rounded-admin-sm px-4 py-2 text-admin-caption text-admin-danger hover:bg-white/60">
          <LogOut className="size-3.5" aria-hidden="true" /> Exit Room
        </button>
      </div>
    </aside>
  );
}
