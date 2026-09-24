import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft, IdCard, FileText, ExternalLink, CheckCircle2, XCircle, TriangleAlert, Lock, FolderOpen,
} from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { cn } from "../../../lib/utils";
import type { NursingCaseDetail } from "../../onsite-nursing-officer/lib/types";
import { LAB_FIELDS, VITAL_FIELDS } from "../../onsite-nursing-officer/lib/documentation";

interface VitalRow { vitalType: string; value: number | null; recordedAt: string | null; severity: "NORMAL" | "ELEVATED" | null }
interface MetricsSnapshot {
  weightKg: string; heightCm: string; bmi: string; bmiClassification: string; bsa: string;
  crcl: string; crclTier: string; egfr: string; egfrStage: string; recordedAt: string;
  labValues: { analyteCode: string; value: number; unit: string; outOfRange: boolean }[];
}
interface UsageRow { id: string; drugName: string; drugStrength: string; quantityUsed: number; usedAt: string }
interface CaseLock { id: string; triggeredBy: string; status: string }

const VITAL_LABEL = new Map(VITAL_FIELDS.map((f) => [f.type, f]));
const LAB_LABEL = new Map(LAB_FIELDS.map((f) => [f.code, f]));

// The reviewer's view of one case: everything the nurse submitted — identity, vitals, the biometrics/lab
// panel and its computed metrics, medications administered — plus the decision that closes it or sends
// it back.
export default function CaseReviewPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const [nursingCase, setNursingCase] = useState<NursingCaseDetail | null>(null);
  const [vitals, setVitals] = useState<VitalRow[]>([]);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [caseLock, setCaseLock] = useState<CaseLock | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    api.get<{ case: NursingCaseDetail }>(`/nursing-cases/${caseId}`).then((d) => {
      if (cancelled) return;
      setNursingCase(d.case);
      const patientId = d.case.patientId;
      Promise.all([
        api.get<{ vitals: VitalRow[] }>(`/vitals/latest?patientId=${patientId}`).then((r) => setVitals(r.vitals)).catch(() => {}),
        api.get<{ snapshot: MetricsSnapshot | null }>(`/clinical-metrics/current?patientId=${patientId}`).then((r) => setMetrics(r.snapshot)).catch(() => {}),
        api.get<{ usage: UsageRow[] }>(`/drug-usage?nursingCaseId=${caseId}`).then((r) => setUsage(r.usage)).catch(() => {}),
        api.get<{ caseLock: CaseLock | null }>(`/case-locks/active?patientId=${patientId}`).then((r) => setCaseLock(r.caseLock)).catch(() => {}),
      ]).finally(() => { if (!cancelled) setLoading(false); });
    }).catch((err) => {
      if (!cancelled) { setLoadError(err instanceof Error ? err.message : "Could not load this case"); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [caseId]);

  // Records the decision and returns to the queue.
  async function review(decision: "REQUIREMENTS_MET" | "REQUIREMENTS_INCOMPLETE") {
    if (!caseId) return;
    if (decision === "REQUIREMENTS_INCOMPLETE" && !reason.trim()) { setReviewError("A reason is required."); return; }
    setSubmitting(true);
    setReviewError(null);
    try {
      await api.post(`/nursing-cases/${caseId}/review`, { decision, reason: reason.trim() || undefined });
      navigate("/dashboard/quality-assurance-officer");
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not record the decision");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>;
  if (loadError || !nursingCase) return <p className="text-admin-body-sm text-admin-danger">{loadError ?? "Case not found."}</p>;

  const sheet = nursingCase.documentationSheet;
  const reviewable = nursingCase.status === "PENDING_QA_REVIEW";
  const latestReview = nursingCase.reviews[0] ?? null;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate("/dashboard/quality-assurance-officer")} className="flex items-center gap-1 text-admin-caption text-admin-text-secondary">
        <ChevronLeft className="size-3.5" aria-hidden="true" /> Back to Queue
      </button>

      <Card className="flex items-center gap-3 border-admin-border p-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-admin-sidebar-cta text-admin-h4 font-semibold text-white">
          {nursingCase.patientFirstName[0]}{nursingCase.patientLastName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-admin-h4 text-admin-text">{nursingCase.patientFirstName} {nursingCase.patientLastName}</p>
          <p className="text-admin-caption text-admin-text-secondary">
            {nursingCase.patientUniqueId} · {nursingCase.patientGender}, DOB {new Date(nursingCase.patientDob).toLocaleDateString()} · Cycle {nursingCase.cycleNumber}
          </p>
        </div>
        {!reviewable && (
          <span className={cn("rounded-admin-lg px-2.5 py-1 text-admin-caption font-semibold", nursingCase.status === "CLOSED" ? "bg-admin-success/10 text-admin-success" : "bg-admin-card-alt text-admin-text-secondary")}>
            {nursingCase.status === "CLOSED" ? "Closed" : nursingCase.status}
          </span>
        )}
      </Card>

      <button
        onClick={() => navigate(`/dashboard/quality-assurance-officer/patients/${nursingCase.patientId}`)}
        className="flex items-center gap-1.5 text-admin-caption font-semibold text-admin-sidebar-cta"
      >
        <FolderOpen className="size-3.5" aria-hidden="true" /> View Patient Folder — last treatment, case history &amp; documents
      </button>

      {caseLock && (
        <Card className="flex items-start gap-2.5 border-admin-danger/40 bg-admin-danger/5 p-3.5">
          <Lock className="mt-0.5 size-4 shrink-0 text-admin-danger" aria-hidden="true" />
          <p className="text-admin-body-sm text-admin-danger">
            This patient's case is locked ({caseLock.triggeredBy === "CRCL_CRITICAL" ? "critical CrCl" : "critical eGFR"}) pending Senior Clinical Director / Chief Consultant sign-off.
          </p>
        </Card>
      )}

      {sheet ? (
        <>
          <Card className="space-y-2 border-admin-border p-4">
            <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Documentation</p>
            <Row label="Treatment Date" value={sheet.treatmentDate ?? "—"} />
            <Row label="Diagnosis" value={sheet.diagnosis ?? "—"} />
            <Row label="Managing Consultant (QA Officer)" value={sheet.managingConsultant ?? "—"} />
            <Row label="Infusion Time" value={sheet.infusionStartTime || sheet.infusionEndTime ? `${sheet.infusionStartTime?.slice(0, 5) ?? "—"} – ${sheet.infusionEndTime?.slice(0, 5) ?? "—"}` : "—"} />
            <Row label="Next Appointment" value={sheet.nextAppointmentDate ?? "—"} />
            <Row label="UPI" value={sheet.upiCodeEntered} />
            <div className="flex flex-wrap gap-2 pt-1">
              {sheet.idPhotoFileId && (
                <a href={`/api/files/${sheet.idPhotoFileId}/content`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-admin-xs border border-admin-border px-3 py-1.5 text-admin-caption text-admin-text hover:bg-admin-card-alt">
                <IdCard className="size-3.5" aria-hidden="true" /> ID Photo <ExternalLink className="size-3" aria-hidden="true" />
              </a>
              )}
              {sheet.fileReference && (
                <a href={`/api/files/${sheet.fileReference}/content`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-admin-xs border border-admin-border px-3 py-1.5 text-admin-caption text-admin-text hover:bg-admin-card-alt">
                  <FileText className="size-3.5" aria-hidden="true" /> Legacy Upload <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}
            </div>
            {sheet.note && (
              <div className="border-t border-admin-border pt-2">
                <p className="text-admin-micro font-semibold text-admin-text-secondary">Note</p>
                <p className="text-admin-body-sm text-admin-text">{sheet.note}</p>
              </div>
            )}
          </Card>

          <Card className="space-y-2 border-admin-border p-4">
            <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Vitals</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {metrics && (
                <>
                  <Row label="Weight" value={`${Number(metrics.weightKg)} kg`} />
                  <Row label="Height" value={`${Number(metrics.heightCm)} cm`} />
                </>
              )}
              {vitals.filter((v) => v.value !== null && VITAL_LABEL.has(v.vitalType)).map((v) => {
                // WEIGHT_KG is excluded here on purpose: it's the same vital_type the (now-legacy) generic
                // vitals recorder used, but this sheet's own weight comes from the biometrics/labs snapshot
                // above, not this list — showing both would either duplicate it or show a stale reading.
                const f = VITAL_LABEL.get(v.vitalType)!;
                return <Row key={v.vitalType} label={f.label} value={`${v.value} ${f.unit}`} danger={v.severity === "ELEVATED"} />;
              })}
              {vitals.every((v) => v.value === null) && !metrics && <p className="col-span-2 text-admin-body-sm text-admin-text-secondary">No vitals recorded.</p>}
            </div>
          </Card>

          {metrics && (
            <Card className="space-y-2 border-admin-border p-4">
              <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Computed Metrics</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Row label="BMI" value={`${Number(metrics.bmi).toFixed(1)} (${metrics.bmiClassification})`} />
                <Row label="BSA" value={`${Number(metrics.bsa).toFixed(2)} m²`} />
                <Row label="CrCl" value={`${Number(metrics.crcl).toFixed(1)} (${metrics.crclTier})`} danger={metrics.crclTier !== "NORMAL"} />
                <Row label="eGFR" value={`${Number(metrics.egfr).toFixed(1)} (${metrics.egfrStage})`} danger={!["G1", "G2"].includes(metrics.egfrStage)} />
              </div>
              <p className="border-t border-admin-border pt-2 text-admin-micro font-semibold text-admin-text-secondary">Lab Panel</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {metrics.labValues.map((v) => {
                  const f = LAB_LABEL.get(v.analyteCode);
                  return <Row key={v.analyteCode} label={f?.label ?? v.analyteCode} value={`${v.value} ${v.unit}`} danger={v.outOfRange} />;
                })}
              </div>
            </Card>
          )}

          <Card className="space-y-2 border-admin-border p-4">
            <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Medications Administered</p>
            {usage.length === 0 ? (
              <p className="text-admin-body-sm text-admin-text-secondary">Nothing logged.</p>
            ) : (
              <ul className="space-y-1">
                {usage.map((u) => (
                  <li key={u.id} className="flex justify-between text-admin-body-sm text-admin-text">
                    <span>{u.drugName} <span className="text-admin-text-secondary">{u.drugStrength}</span></span>
                    <span>{u.quantityUsed}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <Card className="flex items-start gap-2.5 border-admin-warning/40 bg-admin-warning/10 p-3.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-admin-warning" aria-hidden="true" />
          <p className="text-admin-body-sm text-admin-text">No documentation has been submitted for this case yet.</p>
        </Card>
      )}

      {latestReview && (
        <Card className={cn("space-y-1 border p-4", latestReview.decision === "REQUIREMENTS_MET" ? "border-admin-success/40 bg-admin-success/5" : "border-admin-danger/40 bg-admin-danger/5")}>
          <p className="text-admin-body-sm font-semibold text-admin-text">
            Previous decision: {latestReview.decision === "REQUIREMENTS_MET" ? "Requirements met" : "Requirements incomplete"}
          </p>
          {latestReview.reason && <p className="text-admin-body-sm text-admin-text">{latestReview.reason}</p>}
          <p className="text-admin-caption text-admin-text-secondary">{new Date(latestReview.reviewedAt).toLocaleString()}</p>
        </Card>
      )}

      {reviewable && sheet && (
        <Card className="space-y-3 border-admin-border p-4">
          <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Decision</p>
          {!showRejectForm ? (
            <div className="flex gap-2">
              <Button onClick={() => setShowRejectForm(true)} variant="outline" disabled={submitting} className="flex-1 rounded-admin-xs border-admin-danger text-admin-danger">
                <XCircle className="size-4" aria-hidden="true" /> Requirements Incomplete
              </Button>
              <Button onClick={() => review("REQUIREMENTS_MET")} loading={submitting} className="flex-1 rounded-admin-xs bg-admin-sidebar-cta hover:bg-admin-sidebar-cta/90">
                <CheckCircle2 className="size-4" aria-hidden="true" /> Requirements Met — Close Case
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000}
                placeholder="What's missing or needs correcting?"
                className="w-full rounded-admin-sm border border-admin-border px-3 py-2 text-admin-body-sm"
              />
              <div className="flex gap-2">
                <Button onClick={() => { setShowRejectForm(false); setReason(""); }} variant="outline" disabled={submitting} className="flex-1 rounded-admin-xs">
                  Cancel
                </Button>
                <Button onClick={() => review("REQUIREMENTS_INCOMPLETE")} loading={submitting} disabled={!reason.trim()} className="flex-1 rounded-admin-xs bg-admin-danger hover:bg-admin-danger/90">
                  Send Back to Nurse
                </Button>
              </div>
            </div>
          )}
          {reviewError && <p className="text-admin-body-sm text-admin-danger">{reviewError}</p>}
        </Card>
      )}
    </div>
  );
}

// One label/value line, optionally flagged as out-of-range.
function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-admin-body-sm">
      <span className="text-admin-text-secondary">{label}</span>
      <span className={cn(danger ? "font-semibold text-admin-danger" : "text-admin-text")}>{value}</span>
    </div>
  );
}
