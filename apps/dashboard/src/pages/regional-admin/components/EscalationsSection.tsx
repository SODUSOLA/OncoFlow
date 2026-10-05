import { useState } from "react";
import { ShieldAlert, CalendarPlus, CircleCheck } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import { useEscalations, type Escalation } from "../lib/useEscalations";
import { NewConsultationModal } from "./NewConsultationModal";

const STATUS_LABEL = { NOTIFIED: "Awaiting consult", CONSULT_SCHEDULED: "Consult scheduled", RESOLVED: "Resolved" } as const;

// VMO hand-offs to a Specialist Oncologist. The Regional Admin acts here: schedule the virtual consult (the
// existing New Consultation flow, prefilled) and close the escalation out. Directors see the same items read-only.
export function EscalationsSection() {
  const { escalations, loading, error, advance } = useEscalations();
  const [showResolved, setShowResolved] = useState(false);
  const [scheduling, setScheduling] = useState<Escalation | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const open = escalations.filter((e) => e.status !== "RESOLVED");
  const resolved = escalations.filter((e) => e.status === "RESOLVED");

  async function run(fn: () => Promise<void>) {
    setActionError(null);
    try { await fn(); } catch (e) { setActionError(e instanceof Error ? e.message : "That didn't work"); }
  }

  return (
    <section id="escalations" className="mb-6 scroll-mt-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="size-2 rounded-full bg-admin-danger" aria-hidden="true" />
        <p className="text-admin-caption font-semibold uppercase tracking-wide text-admin-text-secondary">Specialist escalations</p>
        {open.length > 0 && <span className="rounded-full bg-admin-card-alt px-1.5 py-0.5 text-admin-micro font-semibold text-admin-text-secondary">{open.length}</span>}
      </div>
      {actionError && <p role="alert" className="mb-2 text-admin-body-sm text-admin-danger">{actionError}</p>}
      {loading ? (
        <Card className="border-admin-border p-4 text-center text-admin-body-sm text-admin-text-secondary">Loading…</Card>
      ) : error ? (
        <Card className="border-admin-border p-4 text-admin-body-sm text-admin-danger">{error}</Card>
      ) : open.length === 0 ? (
        <Card className="flex items-center gap-2 border-admin-border p-4 text-admin-body-sm text-admin-text-secondary">
          <CircleCheck className="size-4 shrink-0" aria-hidden="true" /> No open escalations from Virtual Medical Officers.
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {open.map((e) => <EscalationCard key={e.id} e={e} onSchedule={() => setScheduling(e)} onResolve={() => run(() => advance(e.id, "RESOLVED"))} />)}
        </div>
      )}
      {resolved.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowResolved((v) => !v)} className="text-admin-caption font-medium text-admin-text-secondary hover:text-admin-text">
            {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
          </button>
          {showResolved && (
            <div className="mt-2 grid grid-cols-3 gap-4">{resolved.map((e) => <EscalationCard key={e.id} e={e} />)}</div>
          )}
        </div>
      )}
      {scheduling && (
        <NewConsultationModal
          initialPatientId={scheduling.patientId}
          initialPatientLabel={`${scheduling.firstName} ${scheduling.lastName}`}
          onClose={() => setScheduling(null)}
          // Scheduling the consult is what moves the escalation on, so the two can't drift apart.
          onScheduled={() => { void run(() => advance(scheduling.id, "CONSULT_SCHEDULED")); }}
        />
      )}
    </section>
  );
}

function EscalationCard({ e, onSchedule, onResolve }: { e: Escalation; onSchedule?: () => void; onResolve?: () => void }) {
  const by = [e.escalatorFirstName, e.escalatorLastName].filter(Boolean).join(" ") || e.escalatorEmail.split("@")[0];
  return (
    <Card className={cn("space-y-2 border-admin-border p-4 border-l-4", e.status === "NOTIFIED" ? "border-l-admin-danger" : e.status === "CONSULT_SCHEDULED" ? "border-l-admin-warning" : "border-l-admin-success")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-admin-micro font-semibold uppercase text-admin-danger-text">
          <ShieldAlert className="size-3.5" aria-hidden="true" /> {STATUS_LABEL[e.status]}
        </span>
        <span className="text-admin-micro text-admin-text-secondary">{new Date(e.createdAt).toLocaleString()}</span>
      </div>
      <p className="text-admin-body-sm font-semibold text-admin-text">{e.firstName} {e.lastName} <span className="font-normal text-admin-text-secondary">· {e.uniquePatientId}</span></p>
      <p className="text-admin-caption text-admin-text">{e.triggerReason}</p>
      <p className="text-admin-micro text-admin-text-secondary">Escalated by {by}</p>
      {(onSchedule || onResolve) && (
        <div className="flex gap-2 pt-1">
          {e.status === "NOTIFIED" && onSchedule && (
            <Button size="sm" onClick={onSchedule} className="gap-1.5 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
              <CalendarPlus className="size-3.5" aria-hidden="true" /> Schedule consult
            </Button>
          )}
          {onResolve && <Button size="sm" variant="outline" onClick={onResolve} className="rounded-admin-xs border-admin-border text-admin-text">Resolve</Button>}
        </div>
      )}
    </Card>
  );
}
