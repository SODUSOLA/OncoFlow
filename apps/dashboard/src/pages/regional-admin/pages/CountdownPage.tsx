import { useEffect, useMemo, useState } from "react";
import { FlaskConical, TriangleAlert, Clock, Syringe, Lock, CalendarDays } from "lucide-react";
import { api } from "../../../lib/api";
import type { CountdownCase, Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { EscalateCaseButton } from "../components/EscalateCaseButton";
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
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <Card className="flex items-start justify-between rounded-admin-sm border-admin-border p-[17px] shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
          <div>
            <p className="text-admin-body-sm font-semibold tracking-[0.14px] text-admin-text-secondary">Active Cycles</p>
            <p className="mt-1 text-[32px] font-semibold leading-10 text-admin-text">{stats.active}</p>
          </div>
          <FlaskConical className="size-7 text-admin-text-secondary" aria-hidden="true" />
        </Card>
        <Card className="flex items-start justify-between rounded-admin-sm border-admin-danger border-l-4 p-[17px] shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <div>
            <p className="text-admin-body-sm font-semibold tracking-[0.14px] text-admin-text-secondary">SLA Breaches</p>
            <p className="mt-1 text-[32px] font-semibold leading-10 text-admin-danger">{stats.breaches}</p>
          </div>
          <TriangleAlert className="size-7 text-admin-danger" aria-hidden="true" />
        </Card>
        <Card className="flex items-start justify-between rounded-admin-sm border-admin-warning p-[17px] shadow-[0_2px_4px_rgba(230,126,34,0.15)]">
          <div>
            <p className="text-admin-body-sm font-semibold tracking-[0.14px] text-admin-text-secondary">At Risk (Next 24h)</p>
            <p className="mt-1 text-[32px] font-semibold leading-10 text-admin-warning">{stats.atRisk}</p>
          </div>
          <Clock className="size-7 text-admin-warning" aria-hidden="true" />
        </Card>
        <Card className="flex items-start justify-between rounded-admin-sm border-admin-border p-[17px] shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
          <div>
            <p className="text-admin-body-sm font-semibold tracking-[0.14px] text-admin-text-secondary">Infusion Ready (Day 0)</p>
            <p className="mt-1 text-[32px] font-semibold leading-10 text-admin-success">{stats.infusionReady}</p>
          </div>
          <Syringe className="size-7 text-admin-success" aria-hidden="true" />
        </Card>
      </div>

      {visibleCases.length === 0 ? (
        <Card className="border-admin-border p-8 text-center text-admin-body-sm text-admin-text-secondary">No active countdown cases</Card>
      ) : (
        <div className="flex items-start gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((col) => {
            const colCases = visibleCases.filter((c) => col.match(c.currentDay));
            const isDay0 = col.key === "day0";
            return (
              <section
                key={col.key}
                className={cn(
                  "flex max-h-[640px] shrink-0 flex-col overflow-hidden",
                  isDay0
                    ? "w-[306px] rounded-admin-md border-2 border-admin-success bg-white p-0.5 shadow-[0_4px_12px_rgba(45,106,79,0.10)]"
                    : "w-[282px] rounded-admin-md border border-admin-border bg-admin-card-alt p-px",
                )}
              >
                <header
                  className={cn(
                    "flex items-center justify-between px-4 pb-[17px] pt-4",
                    isDay0 ? "rounded-t-admin-sm bg-admin-success" : "border-b border-admin-border bg-[#EFEDF1]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isDay0 && <Syringe className="size-5 text-white" aria-hidden="true" />}
                    <h2 className={cn("text-admin-h3", isDay0 ? "text-white" : "text-admin-text")}>
                      {col.label}{" "}
                      <span className={cn("text-admin-body-sm font-normal", isDay0 ? "text-white/80" : "text-admin-text-secondary")}>{col.sub}</span>
                    </h2>
                  </div>
                  <span className={cn(
                    "rounded-admin-xs px-2 py-1 text-admin-caption font-bold",
                    isDay0 ? "bg-white/20 text-white" : "bg-admin-disabled text-admin-text",
                  )}>
                    {colCases.length}
                  </span>
                </header>
                <div className={cn("flex-1 space-y-3 overflow-y-auto p-3", isDay0 && "bg-admin-canvas-bg/30")}>
                  {colCases.map((c) => {
                    const patient = patientById.get(c.patientId);
                    const status = deriveStatus(c);
                    const flagged = isCountdownBreached(status);
                    const name = patient ? `${patient.firstName} ${patient.lastName}` : c.patientId.slice(0, 8);
                    const dueDate = new Date(Date.now() + c.currentDay * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                    const dot = flagged ? "bg-admin-danger" : status === "awaiting-consent" || status === "md-review-pending" ? "bg-admin-warning" : "bg-[#74777F]";

                    if (isDay0) {
                      const ready = !!(c.labsUploadedAt && c.resultsSentToQaAt && c.paymentConfirmedAt);
                      return (
                        <article key={c.id} className="relative overflow-hidden rounded-admin-sm border border-admin-border bg-white p-[17px] pl-5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
                          <span className="absolute inset-y-0 left-0 w-1 bg-admin-success" aria-hidden="true" />
                          <Lock className="absolute right-3 top-3 size-4 text-admin-text-secondary" aria-hidden="true" />
                          <p className="pr-6 text-admin-body-sm font-semibold tracking-[0.14px] text-admin-text">{name}</p>
                          <p className="text-admin-body-sm font-medium text-admin-text-secondary">ID: {patient?.uniquePatientId ?? c.patientId.slice(0, 8)}</p>
                          <ul className="mt-3 space-y-1 border-l-2 border-admin-disabled-alt bg-admin-canvas-bg/60 p-2 text-admin-caption text-admin-text-secondary">
                            <li className={c.labsUploadedAt ? "text-admin-success" : ""}>{c.labsUploadedAt ? "✓" : "○"} Consent Signed</li>
                            <li className={c.resultsSentToQaAt ? "text-admin-success" : ""}>{c.resultsSentToQaAt ? "✓" : "○"} MD Cleared</li>
                            <li className={c.paymentConfirmedAt ? "text-admin-success" : ""}>{c.paymentConfirmedAt ? "✓" : "○"} Pharmacy Prep</li>
                          </ul>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!ready}
                            className="mt-3 w-full justify-center rounded-admin-xs bg-admin-success py-2 font-bold hover:bg-admin-success/90"
                          >
                            Begin Sequence →
                          </Button>
                        </article>
                      );
                    }

                    return (
                      <article
                        key={c.id}
                        className={cn(
                          "relative flex flex-col gap-3 overflow-hidden rounded-admin-sm bg-white p-[17px] shadow-[0_1px_1px_rgba(0,0,0,0.05)]",
                          flagged
                            ? "border-2 border-admin-danger bg-[rgba(255,218,214,0.2)]"
                            : status === "md-review-pending"
                              ? "border border-admin-warning shadow-[0_2px_4px_rgba(230,126,34,0.15)]"
                              : "border border-admin-border",
                        )}
                      >
                        {flagged && (
                          <span
                            className="absolute right-0 top-0 size-0 border-l-[28px] border-t-[28px] border-l-transparent border-t-admin-danger"
                            aria-hidden="true"
                          />
                        )}
                        <div>
                          <p className={cn("text-admin-body-sm font-semibold tracking-[0.14px]", flagged ? "text-admin-danger-text" : "text-admin-text")}>{name}</p>
                          <p className="text-admin-body-sm font-medium text-admin-text-secondary">ID: {patient?.uniquePatientId ?? c.patientId.slice(0, 8)}</p>
                        </div>

                        <span className="inline-flex w-fit items-center gap-2 rounded-admin-xs bg-admin-disabled-alt px-2 py-1 text-admin-caption font-semibold text-admin-text-secondary">
                          <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
                          {STATUS_LABEL[status]}
                        </span>

                        {status === "overdue-bloodwork" && (
                          <div className="rounded-admin-xs border border-admin-danger/30 bg-white/50 p-2 text-admin-caption text-admin-danger-text">
                            Overdue Bloodwork — CBC required before Day 3 Review.
                          </div>
                        )}

                        {status === "md-review-pending" && c.labsUploadedAt && (
                          <div className="flex items-center gap-1.5 rounded-admin-xs border border-admin-border/50 bg-admin-card-alt p-2 text-admin-caption text-admin-text-secondary">
                            <span className="text-admin-success" aria-hidden="true">✓</span> Labs verified
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 border-t border-admin-border pt-[13px]">
                          <span className="flex items-center gap-1 text-admin-caption text-admin-text-secondary">
                            <CalendarDays className="size-3" aria-hidden="true" />
                            {dueDate}
                          </span>
                          {flagged ? (
                            <EscalateCaseButton caseId={c.id} label="Escalate" variant="danger" />
                          ) : status === "md-review-pending" ? (
                            <EscalateCaseButton caseId={c.id} label="Nudge MD" variant="outline" />
                          ) : (
                            <span className="rounded-admin-xs bg-admin-info-bg px-2 py-1 text-admin-caption font-semibold text-admin-info-text">On Track</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {colCases.length === 0 && (
                    <p className="rounded-admin-sm border border-dashed border-admin-border p-4 text-center text-admin-caption text-admin-text-secondary">Empty</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
