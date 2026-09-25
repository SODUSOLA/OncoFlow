import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Card } from "./ui/Card";
import { cn } from "../lib/utils";

type Stage =
  | "CASE_STARTED" | "IDENTITY_VERIFIED" | "IDENTITY_MISMATCH_REPORTED" | "INFUSION_IN_PROGRESS"
  | "INFUSION_COMPLETED" | "AWAITING_QA_REVIEW" | "SENT_BACK_BY_QA" | "CLOSED";

interface LiveCase {
  id: string; status: "STARTED" | "PENDING_QA_REVIEW" | "CLOSED"; stage: Stage;
  startedAt: string; closedAt: string | null;
  infusionStartedAt: string | null; infusionEndedAt: string | null;
  patientFirstName: string; patientLastName: string; patientUniqueId: string;
  facilityName: string; cycleNumber: number; nurseName: string | null;
  timeline: Array<{ eventType: string; occurredAt: string }>;
}

const STAGE_LABEL: Record<Stage, string> = {
  CASE_STARTED: "Case started", IDENTITY_VERIFIED: "Identity verified", IDENTITY_MISMATCH_REPORTED: "Identity mismatch reported",
  INFUSION_IN_PROGRESS: "Infusion in progress", INFUSION_COMPLETED: "Infusion completed — documenting",
  AWAITING_QA_REVIEW: "Awaiting QA review", SENT_BACK_BY_QA: "Sent back by QA", CLOSED: "Closed by QA",
};
const STAGE_TONE: Record<Stage, string> = {
  CASE_STARTED: "bg-admin-card-alt text-admin-text-secondary",
  IDENTITY_VERIFIED: "bg-admin-card-alt text-admin-text",
  IDENTITY_MISMATCH_REPORTED: "bg-admin-danger/10 text-admin-danger",
  INFUSION_IN_PROGRESS: "bg-admin-sidebar-cta/10 text-admin-sidebar-cta",
  INFUSION_COMPLETED: "bg-admin-sidebar-cta/10 text-admin-sidebar-cta",
  AWAITING_QA_REVIEW: "bg-admin-warning/10 text-admin-warning",
  SENT_BACK_BY_QA: "bg-admin-danger/10 text-admin-danger",
  CLOSED: "bg-admin-success/10 text-admin-success",
};
const EVENT_LABEL: Record<string, string> = {
  CASE_STARTED: "Case started", IDENTITY_VERIFIED: "Identity verified", IDENTITY_MISMATCH_REPORTED: "Mismatch reported",
  INFUSION_STARTED: "Infusion started", INFUSION_ENDED: "Infusion ended", SUBMITTED_FOR_QA: "Submitted to QA",
  SENT_BACK_BY_QA: "Sent back", CLOSED_BY_QA: "Closed",
};

const POLL_MS = 10_000;

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

// Minutes an infusion has been running (or ran for), or null before it starts.
function infusionMinutes(c: LiveCase, now: number): number | null {
  if (!c.infusionStartedAt) return null;
  const end = c.infusionEndedAt ? new Date(c.infusionEndedAt).getTime() : now;
  return Math.max(0, Math.round((end - new Date(c.infusionStartedAt).getTime()) / 60_000));
}

// Live, read-only view of nursing cases across the caller's region: the nurse opens and the QA officer closes, and
// this shows every milestone in between as it happens. Shared by Regional Admin and SDNS; refreshes every few seconds.
export function CaseBoard() {
  const [cases, setCases] = useState<LiveCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"live" | "closed">("live");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await api.get<{ cases: LiveCase[] }>("/nursing-cases/live");
        if (!cancelled) { setCases(d.cases); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load cases");
      } finally {
        if (!cancelled) { setLoading(false); setNow(Date.now()); }
      }
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const live = cases.filter((c) => c.status !== "CLOSED");
  const closed = cases.filter((c) => c.status === "CLOSED");
  const shown = tab === "live" ? live : closed;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([["live", `In progress (${live.length})`], ["closed", `Closed today (${closed.length})`]] as const).map(([key, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={cn(
              "rounded-admin-sm border px-3 py-1.5 text-admin-caption font-semibold",
              tab === key ? "border-admin-sidebar-cta bg-admin-sidebar-cta text-white" : "border-admin-border text-admin-text-secondary",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-admin-body-sm text-admin-danger">{error}</p>}
      {loading ? (
        <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>
      ) : shown.length === 0 ? (
        <Card className="p-8 text-center text-admin-body-sm text-admin-text-secondary">
          {tab === "live" ? "No cases in progress right now." : "No cases closed today."}
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((c) => {
            const mins = infusionMinutes(c, now);
            return (
              <Card key={c.id} className="space-y-3 border-admin-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-admin-body-sm font-semibold text-admin-text">{c.patientFirstName} {c.patientLastName}</p>
                    <p className="text-admin-caption text-admin-text-secondary">
                      {c.patientUniqueId} · Cycle {c.cycleNumber} · {c.facilityName} · Nurse {c.nurseName ?? "—"}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-1 text-admin-micro font-semibold", STAGE_TONE[c.stage])}>{STAGE_LABEL[c.stage]}</span>
                </div>
                {mins !== null && (
                  <p className="text-admin-caption text-admin-text-secondary">
                    Infusion {c.infusionEndedAt ? "ran" : "running"} for <span className="font-semibold text-admin-text">{mins} min</span>
                  </p>
                )}
                <ol className="flex flex-wrap gap-x-4 gap-y-1">
                  {c.timeline.map((e, i) => (
                    <li key={i} className="text-admin-micro text-admin-text-secondary">
                      <span className="font-semibold text-admin-text">{hhmm(e.occurredAt)}</span> {EVENT_LABEL[e.eventType] ?? e.eventType}
                    </li>
                  ))}
                </ol>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
