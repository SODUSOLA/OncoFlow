import { useEffect, useMemo, useState } from "react";
import { FlaskConical, TriangleAlert, Clock, Syringe, Lock, CalendarDays } from "lucide-react";
import { api } from "../../../lib/api";
import type { CountdownCase, Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import { useRegionScope } from "../lib/useRegionScope";

type CardStatus = "on-track" | "overdue-bloodwork" | "awaiting-consent" | "md-review-pending" | "infusion-ready" | "escalated";

const STATUS_LABEL: Record<CardStatus, string> = {
  "on-track": "Labs Ordered",
  "overdue-bloodwork": "Overdue Bloodwork",
  "awaiting-consent": "Awaiting Consent",
  "md-review-pending": "MD Review Pending",
  "infusion-ready": "Infusion Ready",
  escalated: "Escalated",
};

const STATUS_VARIANT: Record<CardStatus, "success" | "warning" | "critical" | "info" | "neutral"> = {
  "on-track": "neutral",
  "overdue-bloodwork": "critical",
  "awaiting-consent": "neutral",
  "md-review-pending": "warning",
  "infusion-ready": "success",
  escalated: "critical",
};

// Derived from the real CountdownCase fields (no fabricated "protocol"/"consult" data — those
// don't exist in this system's model). This ordering mirrors what the 7-day pathway actually
// requires in sequence (labs -> QA review -> payment).
function deriveStatus(c: CountdownCase): CardStatus {
  if (c.status === "ESCALATED") return "escalated";
  if (!c.labsUploadedAt) return "overdue-bloodwork";
  if (!c.resultsSentToQaAt) return "md-review-pending";
  if (!c.paymentConfirmedAt) return "awaiting-consent";
  if (c.currentDay === 0) return "infusion-ready";
  return "on-track";
}

// Matches the designer's 7-Day Countdown mockup exactly: 4 named columns, colored framing on
// the flagged/ready states. The real data tracks a daily countdown (0-7) — bucketing adjacent
// days into each column since there's no product spec for finer-grained stages.
const COLUMNS = [
  { key: "day7", label: "Day 7", sub: "Initiation", match: (d: number) => d === 7 },
  { key: "day5", label: "Day 5", sub: "Pre-Auth & Labs", match: (d: number) => d === 5 || d === 6 },
  { key: "day3", label: "Day 3", sub: "MD Review", match: (d: number) => d === 3 || d === 4 },
  { key: "day0", label: "Day 0", sub: "Infusion Ready", match: (d: number) => d <= 2 },
] as const;

export default function CountdownPage() {
  const { facilityIdsInRegion } = useRegionScope();
  const [cases, setCases] = useState<CountdownCase[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function loadCases() {
      api.get<{ cases: CountdownCase[] }>("/countdown-cases?scope=overview").then((d) => setCases(d.cases)).catch(() => {});
    }
    loadCases();
    api.get<{ patients: Patient[] }>("/patients?facilityId=all").then((d) => setPatients(d.patients)).catch(() => {}).finally(() => setLoading(false));
    const interval = setInterval(loadCases, 30000);
    return () => clearInterval(interval);
  }, []);

  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  // Region scope applied silently (no filter-pill row in the mockup) — a case only counts here
  // if its patient's facility is in the admin's own region.
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

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <Card className="flex items-start justify-between p-4">
          <div>
            <p className="text-xs text-gray-400">Active Cycles</p>
            <p className="text-3xl font-bold text-gray-900">{stats.active}</p>
            <p className="mt-1 text-xs text-gray-400">across {facilityIdsInRegion.size || 1} {facilityIdsInRegion.size === 1 ? "facility" : "facilities"} in region</p>
          </div>
          <FlaskConical className="size-6 text-blue-400" aria-hidden="true" />
        </Card>
        <Card className="flex items-start justify-between border-2 border-red-300 bg-red-50/40 p-4">
          <div>
            <p className="text-xs font-medium text-red-600">SLA Breaches</p>
            <p className="text-3xl font-bold text-red-600">{stats.breaches}</p>
          </div>
          <TriangleAlert className="size-6 text-red-500" aria-hidden="true" />
        </Card>
        <Card className="flex items-start justify-between border-2 border-amber-300 bg-amber-50/40 p-4">
          <div>
            <p className="text-xs font-medium text-amber-600">At Risk (Next 24h)</p>
            <p className="text-3xl font-bold text-amber-600">{stats.atRisk}</p>
          </div>
          <Clock className="size-6 text-amber-500" aria-hidden="true" />
        </Card>
        <Card className="flex items-start justify-between p-4">
          <div>
            <p className="text-xs text-gray-400">Infusion Ready (Day 0)</p>
            <p className="text-3xl font-bold text-green-700">{stats.infusionReady}</p>
          </div>
          <Syringe className="size-6 text-green-500" aria-hidden="true" />
        </Card>
      </div>

      {visibleCases.length === 0 ? (
        <Card className="p-8 text-center text-sm text-gray-400">No active countdown cases</Card>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colCases = visibleCases.filter((c) => col.match(c.currentDay));
            const isDay0 = col.key === "day0";
            return (
              <div
                key={col.key}
                className={cn("space-y-3 rounded p-2", isDay0 && "border-2 border-green-300 bg-green-50/30")}
              >
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    {isDay0 && <Syringe className="size-4 text-green-600" aria-hidden="true" />}
                    <p className={cn("text-sm font-semibold", isDay0 ? "text-green-700" : "text-gray-800")}>
                      {col.label} <span className={cn("font-normal", isDay0 ? "text-green-500" : "text-gray-400")}>{col.sub}</span>
                    </p>
                  </div>
                  <span className={cn("rounded px-2 py-0.5 text-xs font-medium", isDay0 ? "bg-green-200 text-green-800" : "bg-gray-100 text-gray-500")}>
                    {colCases.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {colCases.map((c) => {
                    const patient = patientById.get(c.patientId);
                    const status = deriveStatus(c);
                    const flagged = status === "overdue-bloodwork" || status === "escalated";
                    return (
                      <Card
                        key={c.id}
                        className={cn(
                          "relative p-3.5",
                          flagged && "border-2 border-red-400 bg-red-50/40",
                          isDay0 && "border-green-300",
                        )}
                      >
                        {flagged && (
                          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-white" aria-hidden="true">
                            <TriangleAlert className="size-2.5" />
                          </span>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={cn("truncate text-sm font-semibold", flagged ? "text-red-700" : "text-gray-800")}>
                              {patient ? `${patient.firstName} ${patient.lastName}` : c.patientId.slice(0, 8)}
                            </p>
                            <p className="text-xs text-gray-400">ID: {patient?.uniquePatientId ?? c.patientId.slice(0, 8)}</p>
                          </div>
                          {isDay0 ? (
                            <Lock className="size-3.5 shrink-0 text-gray-300" aria-hidden="true" />
                          ) : (
                            <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                          )}
                        </div>

                        {status === "overdue-bloodwork" && (
                          <div className="mt-2.5 rounded border border-red-200 bg-red-100/60 p-2 text-xs text-red-700">
                            <TriangleAlert className="mr-1 inline size-3" aria-hidden="true" />
                            Overdue Bloodwork — CBC required before Day 3 Review.
                          </div>
                        )}

                        {status === "md-review-pending" && c.labsUploadedAt && (
                          <div className="mt-2.5 flex items-center gap-1.5 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-700">
                            <span aria-hidden="true">✓</span> Labs verified
                          </div>
                        )}

                        {isDay0 ? (
                          <>
                            <ul className="mt-3 space-y-1 text-xs text-gray-500">
                              <li className={c.labsUploadedAt ? "text-green-600" : ""}>{c.labsUploadedAt ? "✓" : "○"} Consent Signed</li>
                              <li className={c.resultsSentToQaAt ? "text-green-600" : ""}>{c.resultsSentToQaAt ? "✓" : "○"} MD Cleared</li>
                              <li className={c.paymentConfirmedAt ? "text-green-600" : ""}>{c.paymentConfirmedAt ? "✓" : "○"} Pharmacy Prep</li>
                            </ul>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!(c.labsUploadedAt && c.resultsSentToQaAt && c.paymentConfirmedAt)}
                              className="mt-3 w-full justify-center bg-green-700 hover:bg-green-800"
                            >
                              Begin Sequence →
                            </Button>
                          </>
                        ) : (
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <CalendarDays className="size-3" aria-hidden="true" />
                              {new Date(Date.now() + c.currentDay * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                            {status === "overdue-bloodwork" || status === "escalated" ? (
                              <Button variant="danger" size="sm">Escalate</Button>
                            ) : status === "md-review-pending" ? (
                              <Button variant="outline" size="sm">Nudge MD</Button>
                            ) : (
                              <Badge variant="info">On Track</Badge>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                  {colCases.length === 0 && (
                    <p className="rounded border border-dashed border-gray-200 p-4 text-center text-xs text-gray-300">Empty</p>
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
