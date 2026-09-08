import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert, Clock3, CircleCheck, ClipboardList, Lock, MessageCircle } from "lucide-react";
import { api } from "../../../lib/api";
import type { Appointment, Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../lib/auth";
import { useConsultantAlerts } from "../lib/useConsultantAlerts";
import type { ConsultAlert } from "../lib/alertsStore";

// Phase 8 — deliberately a different layout from Regional Admin's 3-column bento (two columns +
// a stacked right-side panel, per the build guide), but the same underlying principle: this page
// renders the shared alert aggregator (useConsultantAlerts), it does not compute alerts itself.
const MAX_CARDS = 8;
const MAX_LOG_ITEMS = 8;
const NOTE_PATIENT_LIMIT = 15;

interface NoteLogEntry { id: string; note: string; createdAt: string; patientName: string }

// Real, bounded, read-only — recent clinical notes across this consultant's own recent patients
// (same appointment window the alert aggregator uses). Deliberately not "Patient Messages": this
// role has no `conversation:read` grant, so /conversations?assignedTo= would just 403 — the same
// RBAC wall Clinical Chat sits behind, handled the same honest way rather than faking a feed.
function useClinicalNoteLog(limit: number) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<NoteLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.facilityId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const [appointments, patients] = await Promise.all([
        api.get<{ appointments: Appointment[] }>(`/appointments?facilityId=${user.facilityId}`).then((d) => d.appointments).catch(() => []),
        api.get<{ patients: Patient[] }>("/patients?facilityId=all").then((d) => d.patients).catch(() => []),
      ]);
      if (cancelled) return;
      const patientById = new Map(patients.map((p) => [p.id, p]));
      const patientIds = [...new Set(appointments.filter((a) => a.oncologistId === user.id).map((a) => a.patientId))].slice(0, NOTE_PATIENT_LIMIT);

      const perPatient = await Promise.all(patientIds.map((patientId) =>
        api.get<{ notes: { id: string; note: string; createdAt: string }[] }>(`/clinical-notes?patientId=${patientId}`)
          .then((d) => d.notes.map((n) => ({ ...n, patientId })))
          .catch(() => []),
      ));
      if (cancelled) return;
      const merged = perPatient.flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit)
        .map((n) => {
          const p = patientById.get(n.patientId);
          return { id: n.id, note: n.note, createdAt: n.createdAt, patientName: p ? `${p.firstName} ${p.lastName}` : n.patientId.slice(0, 8) };
        });
      setEntries(merged);
      setLoading(false);
    })().catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [user?.facilityId, user?.id, limit]);

  return { entries, loading };
}

export default function NotificationCenterPage() {
  const navigate = useNavigate();
  const { alerts, loading } = useConsultantAlerts();
  const { entries: noteLog, loading: noteLoading } = useClinicalNoteLog(MAX_LOG_ITEMS);

  const sorted = [...alerts].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
  const visible = sorted.slice(0, MAX_CARDS);
  const hidden = sorted.length - visible.length;

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-admin-danger" aria-hidden="true" />
          <p className="text-admin-caption font-semibold uppercase tracking-wide text-admin-text-secondary">Critical Alerts</p>
          {alerts.length > 0 && (
            <span className="rounded-full bg-admin-card-alt px-1.5 py-0.5 text-admin-micro font-semibold text-admin-text-secondary">{alerts.length}</span>
          )}
        </div>
        {loading ? (
          <Card className="border-admin-border p-4 text-center text-admin-body-sm text-admin-text-secondary">Loading…</Card>
        ) : visible.length === 0 ? (
          <Card className="flex items-center gap-2 border-admin-border p-4 text-admin-body-sm text-admin-text-secondary">
            <CircleCheck className="size-4 shrink-0" aria-hidden="true" /> Nothing needs attention right now.
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visible.map((a) => (
              <AlertCard key={a.id} alert={a} onAction={() => navigate(a.actionTo)} />
            ))}
          </div>
        )}
        {hidden > 0 && (
          <button
            onClick={() => navigate(visible[0]?.actionTo ?? "/dashboard/consulting-oncologist")}
            className="w-full rounded-admin-sm border border-dashed border-admin-border py-2 text-admin-caption font-medium text-admin-text-secondary hover:border-admin-sidebar-cta hover:text-admin-sidebar-cta"
          >
            +{hidden} more — open source
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <Card className="border-admin-border p-4 opacity-80">
          <p className="flex items-center gap-1.5 text-admin-caption font-semibold uppercase tracking-wide text-admin-text-secondary">
            <MessageCircle className="size-3.5" aria-hidden="true" /> Patient Messages
          </p>
          <div className="mt-3 flex items-center gap-2 text-admin-body-sm text-admin-text-secondary">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            Not available to this role yet — Consulting Oncologist has no conversation-read grant in this build.
          </div>
        </Card>

        <Card className="border-admin-border p-4">
          <p className="flex items-center gap-1.5 text-admin-caption font-semibold uppercase tracking-wide text-admin-text-secondary">
            <ClipboardList className="size-3.5" aria-hidden="true" /> System Log
          </p>
          {noteLoading ? (
            <p className="mt-3 text-admin-body-sm text-admin-text-secondary">Loading…</p>
          ) : noteLog.length === 0 ? (
            <p className="mt-3 text-admin-body-sm text-admin-text-secondary">No recent clinical notes across your patients.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {noteLog.map((n) => (
                <li key={n.id} className="rounded-admin-sm px-1 py-2">
                  <p className="text-admin-caption text-admin-text">
                    Clinical note added for <span className="font-medium">{n.patientName}</span>
                  </p>
                  <p className="text-admin-micro text-admin-text-secondary">{new Date(n.createdAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function AlertCard({ alert, onAction }: { alert: ConsultAlert; onAction: () => void }) {
  const critical = alert.severity === "critical";
  const Icon = critical ? TriangleAlert : Clock3;
  return (
    <Card className={cn("space-y-2 border-admin-border p-4", critical ? "border-l-4 border-l-admin-danger" : "border-l-4 border-l-admin-warning")}>
      <div className="flex items-center gap-2">
        <Icon className={cn("size-3.5", critical ? "text-admin-danger" : "text-admin-warning")} aria-hidden="true" />
        <span className={cn(
          "rounded-admin-xs px-1.5 py-0.5 text-admin-micro font-semibold",
          critical ? "bg-admin-danger/10 text-admin-danger-text" : "bg-admin-warning/15 text-admin-warning",
        )}>
          {alert.badge}
        </span>
      </div>
      <p className="text-admin-body-sm font-semibold text-admin-text">{alert.title}</p>
      <p className="text-admin-caption text-admin-text-secondary">{alert.detail}</p>
      <Button
        onClick={onAction}
        size="sm"
        variant={critical ? "primary" : "outline"}
        className={cn("rounded-admin-xs", critical ? "bg-admin-danger hover:bg-admin-danger/90" : "border-admin-border text-admin-text hover:border-admin-sidebar-cta hover:text-admin-sidebar-cta")}
      >
        {alert.actionLabel}
      </Button>
    </Card>
  );
}
