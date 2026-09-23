import { useEffect, useMemo, useState } from "react";
import { FlaskConical, TriangleAlert, Clock, Syringe, Lock, CalendarDays } from "lucide-react";
import { api } from "../../../lib/api";
import type { CountdownCase, Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import { useRegionScope } from "../lib/useRegionScope";
import { type CountdownCardStatus, deriveCountdownStatus, isCountdownBreached } from "../lib/countdownStatus";

type CardStatus = CountdownCardStatus;

const STATUS_LABEL: Record<CardStatus, string> = {
  "on-track": "Labs Ordered",
  "overdue-bloodwork": "Overdue Bloodwork",
  "awaiting-consent": "Awaiting Consent",
  "md-review-pending": "MD Review Pending",
  "infusion-ready": "Infusion Ready",
  escalated: "Escalated",
};

// Overrides Badge's generic colors per instance with the locked admin-* SLA badge colors, without changing Badge for other screens.
const STATUS_BADGE_CLASS: Record<CardStatus, string> = {
  "on-track": "bg-admin-disabled-alt text-admin-text-secondary",
  "overdue-bloodwork": "bg-admin-danger/10 text-admin-danger-text",
  "awaiting-consent": "bg-admin-disabled-alt text-admin-text-secondary",
  "md-review-pending": "bg-admin-warning/15 text-admin-warning",
  "infusion-ready": "bg-admin-success/15 text-admin-success",
  escalated: "bg-admin-danger/10 text-admin-danger-text",
};

// Status derived from real CountdownCase fields in the pathway's order (labs → QA → payment), shared with the bell alert and Notification Center.
const deriveStatus = deriveCountdownStatus;

// Four named columns matching the mockup, bucketing adjacent countdown days since no finer stage spec exists.
const COLUMNS = [
  { key: "day7", label: "Day 7", sub: "Initiation", match: (d: number) => d === 7 },
  { key: "day5", label: "Day 5", sub: "Pre-Auth & Labs", match: (d: number) => d === 5 || d === 6 },
  { key: "day3", label: "Day 3", sub: "MD Review", match: (d: number) => d === 3 || d === 4 },
  { key: "day0", label: "Day 0", sub: "Infusion Ready", match: (d: number) => d <= 2 },
] as const;

// 7-day countdown board.
export default function CountdownPage() {
  const { facilityIdsInRegion } = useRegionScope();
  const [cases, setCases] = useState<CountdownCase[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Loads the region's countdown cases.
    function loadCases() {
      api.get<{ cases: CountdownCase[] }>("/countdown-cases?scope=overview").then((d) => setCases(d.cases)).catch(() => {});
    }
    loadCases();
    api.get<{ patients: Patient[] }>("/patients?facilityId=all").then((d) => setPatients(d.patients)).catch(() => {}).finally(() => setLoading(false));
    const interval = setInterval(loadCases, 30000);
    return () => clearInterval(interval);
  }, []);

  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  // Region scope applies silently: a case counts only if its patient's facility is in the admin's region.
  const visibleCases = useMemo(
    () => cases.filter((c) => {
      const fac = patientById.get(c.patientId)?.facilityId;
      return fac ? facilityIdsInRegion.has(fac) : false;
    }),
    [cases, patientById, facilityIdsInRegion],
  );

  const stats = useMemo(() => ({
    active: visibleCases.filter((c) => c.status === "ACTIVE").length,
    breaches: visibleCases.filter((c) => c.status === "ESCALATED").length,
    atRisk: visibleCases.filter((c) => c.status === "ACTIVE" && c.currentDay <= 1).length,
    infusionReady: visibleCases.filter((c) => c.currentDay === 0 && c.status !== "ESCALATED").length,
  }), [visibleCases]);

  if (loading) return <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {/* Neutral variant */}
        <Card className="flex items-start justify-between border-admin-border p-4">
          <div>
            <p className="text-admin-caption text-admin-text-secondary">Active Cycles</p>
            <p className="text-3xl font-bold text-admin-text">{stats.active}</p>
            <p className="mt-1 text-admin-caption text-admin-text-secondary">across {facilityIdsInRegion.size || 1} {facilityIdsInRegion.size === 1 ? "facility" : "facilities"} in region</p>
          </div>
          <FlaskConical className="size-6 text-admin-text-secondary" aria-hidden="true" />
        </Card>
        {/* Danger variant: left-border strip, not a full ring */}
        <Card className="flex items-start justify-between rounded-admin-sm border-admin-border border-l-4 border-l-admin-danger p-4">
          <div>
            <p className="text-admin-caption font-medium text-admin-danger">SLA Breaches</p>
            <p className="text-3xl font-bold text-admin-danger">{stats.breaches}</p>
          </div>
          <TriangleAlert className="size-6 text-admin-danger" aria-hidden="true" />
        </Card>
        {/* Warning variant: full border */}
        <Card className="flex items-start justify-between border-admin-warning p-4 shadow-admin-warning">
          <div>
            <p className="text-admin-caption font-medium text-admin-warning">At Risk (Next 24h)</p>
            <p className="text-3xl font-bold text-admin-warning">{stats.atRisk}</p>
          </div>
          <Clock className="size-6 text-admin-warning" aria-hidden="true" />
        </Card>
        {/* Success accent: neutral border, colored icon/number only */}
        <Card className="flex items-start justify-between border-admin-border p-4">
          <div>
            <p className="text-admin-caption text-admin-text-secondary">Infusion Ready (Day 0)</p>
            <p className="text-3xl font-bold text-admin-success">{stats.infusionReady}</p>
          </div>
          <Syringe className="size-6 text-admin-success" aria-hidden="true" />
        </Card>
      </div>

      {visibleCases.length === 0 ? (
        <Card className="border-admin-border p-8 text-center text-admin-body-sm text-admin-text-secondary">No active countdown cases</Card>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colCases = visibleCases.filter((c) => col.match(c.currentDay));
            const isDay0 = col.key === "day0";
            return (
              <div key={col.key} className="space-y-3">
                <div
                  className={cn(
                    "flex items-center justify-between rounded-admin-sm px-3 py-2",
                    isDay0 ? "bg-admin-success" : "bg-admin-card-alt",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {isDay0 && <Syringe className="size-4 text-white" aria-hidden="true" />}
                    <p className={cn("text-admin-body-sm font-semibold", isDay0 ? "text-white" : "text-admin-text")}>
                      {col.label} <span className={cn("font-normal", isDay0 ? "text-white/80" : "text-admin-text-secondary")}>{col.sub}</span>
                    </p>
                  </div>
                  <span className={cn("rounded-admin-lg px-2 py-0.5 text-admin-caption font-medium", isDay0 ? "bg-white/20 text-white" : "bg-white text-admin-text-secondary")}>
                    {colCases.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {colCases.map((c) => {
                    const patient = patientById.get(c.patientId);
                    const status = deriveStatus(c);
                    const flagged = isCountdownBreached(status);
                    return (
                      <Card
                        key={c.id}
                        className={cn(
                          "relative border-admin-border p-3.5",
                          // Day-0 cards sit on a dark header, so the red border strip would clash and the corner badge is the only flag.
                          flagged && !isDay0 && "border-l-4 border-l-admin-danger bg-admin-danger/5",
                        )}
                      >
                        {flagged && (
                          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-admin-danger text-white" aria-hidden="true">
                            <TriangleAlert className="size-2.5" />
                          </span>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={cn(
                              "truncate text-admin-body-sm font-semibold",
                              flagged && !isDay0 ? "text-admin-danger-text" : "text-admin-text",
                            )}>
                              {patient ? `${patient.firstName} ${patient.lastName}` : c.patientId.slice(0, 8)}
                            </p>
                            <p className="text-admin-caption text-admin-text-secondary">ID: {patient?.uniquePatientId ?? c.patientId.slice(0, 8)}</p>
                          </div>
                          {isDay0 ? (
                            <Lock className="size-3.5 shrink-0 text-admin-text-secondary" aria-hidden="true" />
                          ) : (
                            <Badge className={STATUS_BADGE_CLASS[status]}>{STATUS_LABEL[status]}</Badge>
                          )}
                        </div>

                        {status === "overdue-bloodwork" && (
                          <div className="mt-2.5 rounded-admin-sm border border-admin-danger/30 bg-admin-danger/10 p-2 text-admin-caption text-admin-danger-text">
                            <TriangleAlert className="mr-1 inline size-3" aria-hidden="true" />
                            Overdue Bloodwork — CBC required before Day 3 Review.
                          </div>
                        )}

                        {status === "md-review-pending" && c.labsUploadedAt && (
                          <div className="mt-2.5 flex items-center gap-1.5 rounded-admin-sm border border-admin-success/30 bg-admin-success/10 p-2 text-admin-caption text-admin-success">
                            <span aria-hidden="true">✓</span> Labs verified
                          </div>
                        )}

                        {isDay0 ? (
                          <>
                            <ul className="mt-3 space-y-1 text-admin-caption text-admin-text-secondary">
                              <li className={c.labsUploadedAt ? "text-admin-success" : ""}>{c.labsUploadedAt ? "✓" : "○"} Consent Signed</li>
                              <li className={c.resultsSentToQaAt ? "text-admin-success" : ""}>{c.resultsSentToQaAt ? "✓" : "○"} MD Cleared</li>
                              <li className={c.paymentConfirmedAt ? "text-admin-success" : ""}>{c.paymentConfirmedAt ? "✓" : "○"} Pharmacy Prep</li>
                            </ul>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!(c.labsUploadedAt && c.resultsSentToQaAt && c.paymentConfirmedAt)}
                              className="mt-3 w-full justify-center rounded-admin-xs bg-admin-success hover:bg-admin-success/90"
                            >
                              Begin Sequence →
                            </Button>
                          </>
                        ) : (
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1 text-admin-caption text-admin-text-secondary">
                              <CalendarDays className="size-3" aria-hidden="true" />
                              {new Date(Date.now() + c.currentDay * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                            {status === "overdue-bloodwork" || status === "escalated" ? (
                              <Button variant="danger" size="sm" className="rounded-admin-xs bg-admin-danger hover:bg-admin-danger/90">Escalate</Button>
                            ) : status === "md-review-pending" ? (
                              <Button variant="outline" size="sm" className="rounded-admin-xs border-admin-border text-admin-text hover:border-admin-sidebar-cta hover:text-admin-sidebar-cta">Nudge MD</Button>
                            ) : (
                              <Badge className="bg-admin-disabled-alt text-admin-text-secondary">On Track</Badge>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                  {colCases.length === 0 && (
                    <p className="rounded-admin-sm border border-dashed border-admin-border p-4 text-center text-admin-caption text-admin-text-secondary">Empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
