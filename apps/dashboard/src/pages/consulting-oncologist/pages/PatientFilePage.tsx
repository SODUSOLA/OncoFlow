import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  TriangleAlert, FileText, FlaskConical, Syringe, ClipboardList, Clock3,
  Heart, Thermometer, Activity as ActivityIcon, Droplets,
} from "lucide-react";
import { api } from "../../../lib/api";
import type { Patient } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { cn } from "../../../lib/utils";
import { useConsultantShell } from "../ConsultantLayout";
import {
  type RegimenData, type ClinicalMetricsSnapshot, type VitalLatest, type VitalTrendPoint,
  type LabDocumentRow, type ActivityEntry, type CaseLockData,
  VITAL_LABELS, VITAL_UNITS, BMI_COLOR, CRCL_COLOR, EGFR_COLOR, TRIGGER_LABEL,
} from "../lib/clinicalTypes";

// Rebuilt to the revised guide: BMI/BSA/CrCl/eGFR are core, and every section reads a real endpoint with no client-computed severity.

const VITAL_ICONS: Record<string, typeof Heart> = { HEART_RATE_BPM: Heart, TEMPERATURE_C: Thermometer, SPO2_PERCENT: Droplets };

// Patient file page: regimen, metrics, vitals, labs and activity for one patient.
export default function PatientFilePage() {
  const { patientId } = useParams<{ patientId: string }>();
  const { setPatientContext } = useConsultantShell();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [regimen, setRegimen] = useState<RegimenData | null>(null);
  const [metrics, setMetrics] = useState<ClinicalMetricsSnapshot | null>(null);
  const [vitals, setVitals] = useState<VitalLatest[]>([]);
  const [weightTrend, setWeightTrend] = useState<VitalTrendPoint[]>([]);
  const [systolicTrend, setSystolicTrend] = useState<VitalTrendPoint[]>([]);
  const [diastolicTrend, setDiastolicTrend] = useState<VitalTrendPoint[]>([]);
  const [documents, setDocuments] = useState<LabDocumentRow[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [caseLock, setCaseLock] = useState<CaseLockData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;

    Promise.all([
      api.get<{ patient: Patient }>(`/patients/${patientId}`),
      api.get<{ regimen: RegimenData | null }>(`/regimen?patientId=${patientId}`).catch(() => ({ regimen: null })),
      api.get<{ snapshot: ClinicalMetricsSnapshot | null }>(`/clinical-metrics/current?patientId=${patientId}`).catch(() => ({ snapshot: null })),
      api.get<{ vitals: VitalLatest[] }>(`/vitals/latest?patientId=${patientId}`).catch(() => ({ vitals: [] })),
      api.get<{ trend: VitalTrendPoint[] }>(`/vitals/trend?patientId=${patientId}&vitalType=WEIGHT_KG&limit=7`).catch(() => ({ trend: [] })),
      api.get<{ trend: VitalTrendPoint[] }>(`/vitals/trend?patientId=${patientId}&vitalType=BLOOD_PRESSURE_SYSTOLIC&limit=7`).catch(() => ({ trend: [] })),
      api.get<{ trend: VitalTrendPoint[] }>(`/vitals/trend?patientId=${patientId}&vitalType=BLOOD_PRESSURE_DIASTOLIC&limit=7`).catch(() => ({ trend: [] })),
      api.get<{ documents: LabDocumentRow[] }>(`/lab-documents?patientId=${patientId}`).catch(() => ({ documents: [] })),
      api.get<{ entries: ActivityEntry[] }>(`/activity-log?patientId=${patientId}`).catch(() => ({ entries: [] })),
      api.get<{ caseLock: CaseLockData | null }>(`/case-locks/active?patientId=${patientId}`).catch(() => ({ caseLock: null })),
    ]).then(([p, r, m, v, wt, st, dt, ld, al, cl]) => {
      if (cancelled) return;
      setPatient(p.patient);
      setPatientContext({
        id: p.patient.id,
        displayId: p.patient.uniquePatientId,
        name: `${p.patient.firstName} ${p.patient.lastName}`,
        initials: `${p.patient.firstName[0] ?? ""}${p.patient.lastName[0] ?? ""}`,
      });
      setRegimen(r.regimen);
      setMetrics(m.snapshot);
      setVitals(v.vitals);
      setWeightTrend(wt.trend);
      setSystolicTrend(st.trend);
      setDiastolicTrend(dt.trend);
      setDocuments(ld.documents);
      setActivity(al.entries);
      setCaseLock(cl.caseLock);
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; setPatientContext(null); };
  }, [patientId, setPatientContext]);

  const age = useMemo(() => {
    if (!patient) return null;
    const dob = new Date(patient.dob);
    const diff = Date.now() - dob.getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  }, [patient]);

  if (loading) return <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>;
  if (!patient) return <p className="text-admin-body-sm text-admin-danger">Patient not found.</p>;

  const nextCycle = regimen?.cycles.find((c) => c.status === "SCHEDULED");

  return (
    <div className="space-y-5">
      {caseLock && <CaseLockBanner lock={caseLock} />}

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 flex items-center gap-5 border-admin-border p-6">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta text-admin-h3 font-semibold text-white">
            {patient.firstName[0]}{patient.lastName[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-admin-h3 text-admin-text">{patient.firstName} {patient.lastName}</p>
              <span className="rounded-admin-lg bg-admin-info-bg px-2.5 py-0.5 text-admin-caption font-medium text-admin-info-text">
                ID: {patient.uniquePatientId}
              </span>
              {caseLock && (
                <span className="rounded-admin-lg bg-admin-danger/10 px-2.5 py-0.5 text-admin-caption font-semibold text-admin-danger-text">Case Locked</span>
              )}
              {regimen?.status === "ACTIVE" && (
                <span className="rounded-admin-lg bg-admin-success/10 px-2.5 py-0.5 text-admin-caption font-semibold text-admin-success">Protocol Active</span>
              )}
            </div>
            <p className="mt-1 text-admin-body-sm text-admin-text-secondary">
              {patient.gender}{age !== null ? `, ${age} years` : ""} · {regimen ? `${regimen.drugName} (${regimen.protocolCode})` : "No active regimen"}
            </p>
          </div>
        </Card>

        <Card className="flex flex-col justify-center gap-1 border-admin-border p-6">
          <p className="flex items-center gap-1.5 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
            <Clock3 className="size-3.5" aria-hidden="true" /> Next Cycle Due
          </p>
          {nextCycle ? (
            <p className="text-admin-h3 text-admin-text">
              {new Date(nextCycle.scheduledDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              <span className="ml-2 text-admin-body-sm font-normal text-admin-text-secondary">Cycle {nextCycle.cycleNumber}</span>
            </p>
          ) : (
            <p className="text-admin-body-sm text-admin-text-secondary">No cycle scheduled</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ActiveRegimenCard regimen={regimen} />
        <ClinicalMetricsCard metrics={metrics} />
      </div>

      <VitalsTrendCard vitals={vitals} weightTrend={weightTrend} systolicTrend={systolicTrend} diastolicTrend={diastolicTrend} />

      <div className="grid grid-cols-2 gap-4">
        <LabDocumentsPanel documents={documents} />
        <ActivityLogTable entries={activity} />
      </div>
    </div>
  );
}

// ---- Case Lock Banner — new, not in the original Figma, takes priority over everything -----

// Banner shown when the patient's case is locked.
function CaseLockBanner({ lock }: { lock: CaseLockData }) {
  return (
    <Card className="flex items-start gap-4 border-2 border-admin-danger bg-admin-danger/5 p-5">
      <TriangleAlert className="mt-0.5 size-6 shrink-0 text-admin-danger" aria-hidden="true" />
      <div>
        <p className="text-admin-h4 text-admin-danger-text">Case Locked — {TRIGGER_LABEL[lock.triggeredBy] ?? lock.triggeredBy}</p>
        <p className="mt-1 text-admin-body-sm text-admin-text">
          Triggered {new Date(lock.triggeredAt).toLocaleString()}. Cycle administration is blocked until resolved.
        </p>
        <p className="mt-1 text-admin-caption font-semibold uppercase tracking-wide text-admin-danger">Pending Clinical Director Review</p>
      </div>
    </Card>
  );
}

// ---- Active Regimen ---------------------------------------------------------------------

// Card showing the active regimen and cycle progress.
function ActiveRegimenCard({ regimen }: { regimen: RegimenData | null }) {
  if (!regimen) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 border-admin-border p-8 text-center">
        <Syringe className="size-6 text-admin-text-secondary" aria-hidden="true" />
        <p className="text-admin-body-sm text-admin-text-secondary">No active regimen on record.</p>
      </Card>
    );
  }
  const pct = regimen.totalCycles > 0 ? regimen.completedCycles / regimen.totalCycles : 0;
  const r = 42;
  const c = 2 * Math.PI * r;

  return (
    <Card className="flex items-center gap-5 border-admin-border p-6">
      <svg viewBox="0 0 100 100" className="size-24 shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E9E7EB" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="#002147" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - pct * c}
        />
        <text x="50" y="50" transform="rotate(90 50 50)" textAnchor="middle" dominantBaseline="middle" className="fill-admin-text text-[22px] font-bold">
          {regimen.completedCycles}/{regimen.totalCycles}
        </text>
      </svg>
      <div>
        <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Active Regimen</p>
        <p className="mt-1 text-admin-h4 text-admin-text">{regimen.drugName}</p>
        <p className="text-admin-body-sm text-admin-text-secondary">{regimen.protocolCode}</p>
        <span className="mt-2 inline-block rounded-admin-lg bg-admin-warning/15 px-2.5 py-0.5 text-admin-caption font-semibold text-admin-warning">
          {regimen.currentCycleNumber ? `In Progress — Cycle ${regimen.currentCycleNumber}` : regimen.status}
        </span>
      </div>
    </Card>
  );
}

// ---- Clinical Metrics — new, not in the original Figma at all -----------------------------

// Card showing clinical metrics tiles.
function ClinicalMetricsCard({ metrics }: { metrics: ClinicalMetricsSnapshot | null }) {
  return (
    <Card className="border-admin-border p-6">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
          <ActivityIcon className="size-3.5" aria-hidden="true" /> Clinical Metrics
        </p>
        {metrics && (
          <span className="text-admin-caption text-admin-text-secondary">
            As of {new Date(metrics.recordedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      {!metrics ? (
        <p className="mt-4 text-admin-body-sm text-admin-text-secondary">No metrics recorded yet for this patient.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricTile label="BMI" value={metrics.bmi} badge={metrics.bmiClassification} color={BMI_COLOR[metrics.bmiClassification] ?? "text-admin-text"} />
          <MetricTile label="BSA" value={`${metrics.bsa} m²`} badge={null} color="text-admin-text" />
          <MetricTile label="CrCl" value={`${metrics.crcl} mL/min`} badge={metrics.crclTier.replace(/_/g, " ")} color={CRCL_COLOR[metrics.crclTier] ?? "text-admin-text"} />
          <MetricTile label="eGFR (KDIGO)" value={`${metrics.egfr} mL/min/1.73m²`} badge={metrics.egfrStage} color={EGFR_COLOR[metrics.egfrStage] ?? "text-admin-text"} />
        </div>
      )}
    </Card>
  );
}

// One metric tile with its classification badge.
function MetricTile({ label, value, badge, color }: { label: string; value: string; badge: string | null; color: string }) {
  return (
    <div className="rounded-admin-sm bg-admin-card-alt p-3">
      <p className="text-admin-micro font-semibold uppercase tracking-wide text-admin-text-secondary">{label}</p>
      <p className={cn("mt-1 text-admin-h4", color)}>{value}</p>
      {badge && <p className={cn("mt-0.5 text-admin-caption font-medium capitalize", color)}>{badge.toLowerCase()}</p>}
    </div>
  );
}

// ---- Vitals Trend — real chart primitives, backend-computed severity only ------------------

// Card showing vitals with weight and blood-pressure trends.
function VitalsTrendCard({
  vitals, weightTrend, systolicTrend, diastolicTrend,
}: {
  vitals: VitalLatest[]; weightTrend: VitalTrendPoint[]; systolicTrend: VitalTrendPoint[]; diastolicTrend: VitalTrendPoint[];
}) {
  const otherVitals = vitals.filter((v) => v.vitalType in VITAL_LABELS);
  return (
    <Card className="border-admin-border p-6">
      <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Vitals Trend</p>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="text-admin-body-sm font-semibold text-admin-text">Weight (kg)</p>
          <WeightBarChart points={weightTrend} />
        </div>
        <div>
          <p className="text-admin-body-sm font-semibold text-admin-text">Blood Pressure (mmHg)</p>
          <BpSparkline systolic={systolicTrend} diastolic={diastolicTrend} />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {otherVitals.map((v) => {
          const Icon = VITAL_ICONS[v.vitalType] ?? ActivityIcon;
          return (
            <div key={v.vitalType} className={cn(
              "rounded-admin-sm p-3",
              v.severity === "ELEVATED" ? "bg-admin-warning/10" : "bg-admin-card-alt",
            )}>
              <p className="flex items-center gap-1.5 text-admin-micro font-semibold uppercase tracking-wide text-admin-text-secondary">
                <Icon className="size-3" aria-hidden="true" /> {VITAL_LABELS[v.vitalType]}
              </p>
              <p className={cn("mt-1 text-admin-h4", v.severity === "ELEVATED" ? "text-admin-warning" : "text-admin-text")}>
                {v.value ?? "—"} <span className="text-admin-caption font-normal text-admin-text-secondary">{VITAL_UNITS[v.vitalType]}</span>
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Bar chart of weight readings.
function WeightBarChart({ points }: { points: VitalTrendPoint[] }) {
  if (points.length === 0) return <p className="mt-3 text-admin-caption text-admin-text-secondary">No readings yet.</p>;
  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value));
  const range = Math.max(max - min, 1);
  return (
    <div className="mt-3 flex h-24 items-end gap-2">
      {points.map((p) => {
        const heightPct = 20 + ((p.value - min) / range) * 80;
        return (
          <div key={p.id} className="flex flex-1 flex-col items-center gap-1">
            <div className="w-full rounded-t-admin-xs bg-admin-sidebar-cta" style={{ height: `${heightPct}%` }} title={`${p.value}kg on ${new Date(p.recordedAt).toLocaleDateString()}`} />
            <span className="text-admin-micro text-admin-text-secondary">{new Date(p.recordedAt).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</span>
          </div>
        );
      })}
    </div>
  );
}

// Sparkline of systolic and diastolic readings.
function BpSparkline({ systolic, diastolic }: { systolic: VitalTrendPoint[]; diastolic: VitalTrendPoint[] }) {
  if (systolic.length === 0) return <p className="mt-3 text-admin-caption text-admin-text-secondary">No readings yet.</p>;
  const allValues = [...systolic, ...diastolic].map((p) => p.value);
  const max = Math.max(...allValues);
  const min = Math.min(...allValues);
  const range = Math.max(max - min, 1);
  const w = 280;
  const h = 80;

  // Converts a trend series into chart points.
  function toPoints(series: VitalTrendPoint[]) {
    return series.map((p, i) => {
      const x = series.length > 1 ? (i / (series.length - 1)) * w : w / 2;
      const y = h - ((p.value - min) / range) * h;
      return `${x},${y}`;
    }).join(" ");
  }

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full">
        <polyline points={toPoints(systolic)} fill="none" stroke="#002147" strokeWidth="2" />
        <polyline points={toPoints(diastolic)} fill="none" stroke="#E67E22" strokeWidth="2" />
      </svg>
      <div className="flex items-center gap-4 text-admin-micro text-admin-text-secondary">
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-admin-sidebar-cta" /> Systolic</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-admin-warning" /> Diastolic</span>
      </div>
    </div>
  );
}

// ---- Lab Documents — Track 2, approval metadata only, no values, no severity ---------------

// Panel listing lab documents and their review status.
function LabDocumentsPanel({ documents }: { documents: LabDocumentRow[] }) {
  return (
    <Card className="overflow-hidden border-admin-border">
      <div className="border-b border-admin-border px-5 py-3.5">
        <p className="flex items-center gap-1.5 text-admin-body-sm font-semibold text-admin-text">
          <FlaskConical className="size-4 text-admin-text-secondary" aria-hidden="true" /> Lab Documents
        </p>
      </div>
      {documents.length === 0 ? (
        <p className="p-6 text-center text-admin-body-sm text-admin-text-secondary">No lab documents uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-admin-border">
          {documents.map((d) => (
            <li key={d.id} className="flex items-start gap-3 p-4">
              <FileText className="mt-0.5 size-4 shrink-0 text-admin-text-secondary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-admin-body-sm text-admin-text">
                  Last uploaded by patient · {new Date(d.uploadedAt).toLocaleDateString()}
                  {d.adminApprovedAt && d.adminName ? ` · Approved by ${d.adminName.split("@")[0]} · ${new Date(d.adminApprovedAt).toLocaleDateString()}` : ""}
                </p>
                {!d.adminApprovedAt && (
                  <p className="text-admin-caption text-admin-text-secondary">{d.workflowStatus.replace(/_/g, " ").toLowerCase()}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---- Clinical Activity Log — union of clinical_note + lab_document, per the data model doc --

const ACTIVITY_ICON: Record<string, typeof ClipboardList> = { CLINICAL_NOTE: ClipboardList, LAB_DOCUMENT: FlaskConical };
const ACTIVITY_LABEL: Record<string, string> = { CLINICAL_NOTE: "Clinical Note", LAB_DOCUMENT: "Lab Document" };

// Table of the patient's recent clinical activity.
function ActivityLogTable({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Card className="overflow-hidden border-admin-border">
      <div className="border-b border-admin-border px-5 py-3.5">
        <p className="text-admin-body-sm font-semibold text-admin-text">Clinical Activity Log</p>
      </div>
      {entries.length === 0 ? (
        <p className="p-6 text-center text-admin-body-sm text-admin-text-secondary">No activity recorded yet.</p>
      ) : (
        <ul className="divide-y divide-admin-border">
          {entries.map((e, i) => {
            const Icon = ACTIVITY_ICON[e.activityType] ?? ClipboardList;
            return (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <Icon className="size-4 shrink-0 text-admin-text-secondary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-admin-body-sm text-admin-text">{ACTIVITY_LABEL[e.activityType] ?? e.activityType}</p>
                  <p className="text-admin-caption text-admin-text-secondary">
                    {e.provider?.split("@")[0]} · {new Date(e.timestamp).toLocaleString()}
                  </p>
                </div>
                {e.status && (
                  <span className="rounded-admin-lg bg-admin-card-alt px-2 py-0.5 text-admin-micro font-medium text-admin-text-secondary">
                    {e.status.replace(/_/g, " ").toLowerCase()}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
