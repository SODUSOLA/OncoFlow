import { NavLink } from "react-router-dom";
import { Search, Folder, Settings, CircleHelp } from "lucide-react";

interface TopBarProps {
  patientFolderTo: string | null;
  showEndConsult: boolean;
  onEndConsult?: () => void;
  profileInitials: string;
}

// Search is static since no destination is defined, while Patient Folder and End Consult are the real context-driven actions.
export function TopBar({ patientFolderTo, showEndConsult, onEndConsult, profileInitials }: TopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-admin-border bg-white px-8">
      <div className="flex items-center gap-2.5">
        <img src="/oncoflow-logo.svg" alt="" className="size-8 shrink-0" />
        <p className="text-admin-h4 text-admin-text">ONCOFLOW LIMITED</p>
      </div>

      <div className="relative hidden md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-admin-text-secondary" aria-hidden="true" />
        <input
          placeholder="Search patient or ID..."
          className="w-64 rounded-admin-lg border border-admin-sidebar-cta bg-white py-2 pl-9 pr-3 text-admin-body-sm text-admin-text placeholder:text-admin-text-secondary focus:outline-none focus:ring-1 focus:ring-admin-sidebar-cta"
        />
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {patientFolderTo && (
          <NavLink
            to={patientFolderTo}
            className="flex items-center gap-2 rounded-admin-lg border border-admin-sidebar-cta px-4 py-1.5 text-admin-body-sm text-admin-text hover:bg-admin-card-alt"
          >
            <Folder className="size-3.5" aria-hidden="true" /> Patient Folder
          </NavLink>
        )}
        {showEndConsult && (
          <button
            onClick={onEndConsult}
            className="rounded-admin-lg bg-admin-danger px-4 py-1.5 text-admin-body-sm text-white hover:bg-admin-danger/90"
          >
            End Consult
          </button>
        )}
        <div className="flex items-center gap-2 border-l border-admin-dark-label/20 pl-4">
          <NavLink to="/dashboard/consulting-oncologist/settings" className="rounded-admin-lg p-2 text-admin-text-secondary hover:bg-admin-card-alt">
            <Settings className="size-5" aria-hidden="true" />
          </NavLink>
          <button className="rounded-admin-lg p-2 text-admin-text-secondary hover:bg-admin-card-alt">
            <CircleHelp className="size-5" aria-hidden="true" />
          </button>
          <div className="flex size-10 items-center justify-center rounded-admin-lg border-2 border-admin-gold-text bg-admin-card-alt text-admin-caption font-semibold text-admin-text">
            {profileInitials}
          </div>
        </div>
      </div>
    </header>
  );
}
