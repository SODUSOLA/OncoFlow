import { useState, createContext, useContext } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Video, History, FlaskConical, Image as ImageIcon, Bell, Settings as SettingsIcon } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Sidebar, type ConsultantNavItem, type PatientContext } from "./shell/Sidebar";
import { TopBar } from "./shell/TopBar";
import { AppShell } from "./shell/AppShell";
import { AddClinicalNoteModal } from "./components/AddClinicalNoteModal";

// "Live Video" is the shell's landing page, the Appointment Grid of today's video queue, not a separate join destination.
const NAV_ITEMS: readonly ConsultantNavItem[] = [
  { to: "/dashboard/consulting-oncologist", label: "Live Video", icon: Video, end: true },
  { to: "/dashboard/consulting-oncologist/patient-history", label: "Patient History", icon: History },
  { to: "/dashboard/consulting-oncologist/lab-results", label: "Lab Results", icon: FlaskConical },
  { to: "/dashboard/consulting-oncologist/imaging", label: "Imaging", icon: ImageIcon },
  // Notifications and Settings live in the sidebar since this shell has no top-bar bell, like Regional Admin.
  { to: "/dashboard/consulting-oncologist/notifications", label: "Notifications", icon: Bell },
  { to: "/dashboard/consulting-oncologist/settings", label: "Settings", icon: SettingsIcon },
];

// Lets a child route tell the shell which patient it's working on so the sidebar card and top bar can react.
interface ConsultantShellContextValue {
  setPatientContext: (ctx: PatientContext | null) => void;
  setShowEndConsult: (show: boolean) => void;
}
// Context sharing the current patient and note actions with the shell.
const ConsultantShellContext = createContext<ConsultantShellContextValue | null>(null);

// Returns the consultant shell context, throwing outside the layout.
export function useConsultantShell(): ConsultantShellContextValue {
  const ctx = useContext(ConsultantShellContext);
  if (!ctx) throw new Error("useConsultantShell must be used within ConsultantLayout");
  return ctx;
}

// Consultant shell with sidebar, top bar and outlet.
export function ConsultantLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [patientContext, setPatientContext] = useState<PatientContext | null>(null);
  const [showEndConsult, setShowEndConsult] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);

  const initials = (user?.email.slice(0, 2) ?? "DR").toUpperCase();

  // Submits a clinical note for the current patient.
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
