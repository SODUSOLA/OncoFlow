import { useState, createContext, useContext } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Video, History, FlaskConical, Image as ImageIcon, Bell, Settings as SettingsIcon } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Sidebar, type ConsultantNavItem, type PatientContext } from "./shell/Sidebar";
import { TopBar } from "./shell/TopBar";
import { AppShell } from "./shell/AppShell";
import { AddClinicalNoteModal } from "./components/AddClinicalNoteModal";

// Phase 1 nav — "Live Video" is this shell's index/landing page (the Appointment Grid, Phase 2):
// in the mockup it's the active item while the Appointment Grid renders, i.e. it isn't a
// separate "join a call" destination, it's this persona's home view of today's video queue.
const NAV_ITEMS: readonly ConsultantNavItem[] = [
  { to: "/dashboard/consulting-oncologist", label: "Live Video", icon: Video, end: true },
  { to: "/dashboard/consulting-oncologist/patient-history", label: "Patient History", icon: History },
  { to: "/dashboard/consulting-oncologist/lab-results", label: "Lab Results", icon: FlaskConical },
  { to: "/dashboard/consulting-oncologist/imaging", label: "Imaging", icon: ImageIcon },
  // Not in Phase 1's original nav spec (added by Phase 8/7) — same reasoning Regional Admin used
  // for its own Notifications/Settings nav entries: Phase 1 explicitly said no top-bar bell
  // pattern for this shell, so these need a real entry point somewhere, and the sidebar is it.
  { to: "/dashboard/consulting-oncologist/notifications", label: "Notifications", icon: Bell },
  { to: "/dashboard/consulting-oncologist/settings", label: "Settings", icon: SettingsIcon },
];

// Lets a child route (e.g. the Appointment Grid, or eventually the Patient File / Video Room)
// tell the shell which patient it's currently working with, so the Sidebar's top card and the
// TopBar's "Patient Folder" link/"End Consult" button can react — this is the "swap on route
// context" behaviour Phase 1's acceptance criteria calls for, driven by the page itself rather
// than re-parsed from the URL in the layout.
interface ConsultantShellContextValue {
  setPatientContext: (ctx: PatientContext | null) => void;
  setShowEndConsult: (show: boolean) => void;
}
const ConsultantShellContext = createContext<ConsultantShellContextValue | null>(null);

export function useConsultantShell(): ConsultantShellContextValue {
  const ctx = useContext(ConsultantShellContext);
  if (!ctx) throw new Error("useConsultantShell must be used within ConsultantLayout");
  return ctx;
}

export function ConsultantLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [patientContext, setPatientContext] = useState<PatientContext | null>(null);
  const [showEndConsult, setShowEndConsult] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);

  const initials = (user?.email.slice(0, 2) ?? "DR").toUpperCase();

  async function submitClinicalNote(note: string) {
    if (!patientContext) return;
    await api.post("/clinical-notes", { patientId: patientContext.id, note });
  }

  return (
    <ConsultantShellContext.Provider value={{ setPatientContext, setShowEndConsult }}>
      <AppShell
        sidebar={
          <Sidebar
            navItems={NAV_ITEMS}
            patientContext={patientContext}
            onAddClinicalNote={() => setNoteModalOpen(true)}
            onExit={() => logout()}
          />
        }
        topBar={
          <TopBar
            patientFolderTo={patientContext ? `/dashboard/consulting-oncologist/patient/${patientContext.id}` : null}
            showEndConsult={showEndConsult}
            onEndConsult={() => navigate("/dashboard/consulting-oncologist")}
            profileInitials={initials}
          />
        }
      >
        <Outlet />
      </AppShell>
      {noteModalOpen && patientContext && (
        <AddClinicalNoteModal
          patientName={patientContext.name}
          onClose={() => setNoteModalOpen(false)}
          onSubmit={submitClinicalNote}
        />
      )}
    </ConsultantShellContext.Provider>
  );
}
