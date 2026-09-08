import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FileCheck2, Lock, Plus, X, Clock3, Heart, Thermometer, Droplets, Activity } from "lucide-react";
import { api } from "../../../lib/api";
import type { Appointment, Patient, Meeting } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { cn } from "../../../lib/utils";
import { useConsultantShell } from "../ConsultantLayout";
import { VITAL_LABELS, VITAL_UNITS, type VitalLatest } from "../lib/clinicalTypes";
import { derivePostConsultSlaState, formatCountdown, postConsultDeadlineMs } from "../lib/consultSla";

// Phase 6 — buildable now with manual/editable fields, per the guide: auto-population from a
// transcript is a follow-up once Decision 3 (transcription/AI summary source) lands. ClinicalNote
// has no update path (see apps/api/src/modules/clinical/service.ts) — so "Sync to EHR & Finalize"
// creating the note IS the lock; there is deliberately no separate "save draft" persistence.
interface SummaryNote { id: string; note: string; authorId: string; createdAt: string }

function composeNote(assessment: string, findings: string, plan: string[]): string {
  const planText = plan.filter((p) => p.trim()).map((p) => `- ${p.trim()}`).join("\n");
  return [
    "PATIENT ASSESSMENT", assessment.trim() || "(none recorded)",
    "", "CLINICAL FINDINGS", findings.trim() || "(none recorded)",
    "", "INTERVENTION & PLAN", planText || "(none recorded)",
  ].join("\n");
}

function parseNote(note: string): { assessment: string; findings: string; plan: string[] } {
  const sections: Record<string, string> = {};
  let current = "";
  for (const line of note.split("\n")) {
    if (["PATIENT ASSESSMENT", "CLINICAL FINDINGS", "INTERVENTION & PLAN"].includes(line.trim())) {
      current = line.trim();
      sections[current] = "";
    } else if (current) {
      sections[current] = (sections[current] ?? "") + line + "\n";
    }
  }
  const plan = (sections["INTERVENTION & PLAN"] ?? "")
    .split("\n").map((l) => l.replace(/^- /, "").trim()).filter(Boolean).filter((l) => l !== "(none recorded)");
  return {
    assessment: (sections["PATIENT ASSESSMENT"] ?? "").trim(),
    findings: (sections["CLINICAL FINDINGS"] ?? "").trim(),
    plan,
  };
}

export default function PostCallSummaryPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const { setPatientContext, setShowEndConsult } = useConsultantShell();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [vitals, setVitals] = useState<VitalLatest[]>([]);
  const [summary, setSummary] = useState<SummaryNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState("");
  const [findings, setFindings] = useState("");
  const [plan, setPlan] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!appointmentId) return;
    setShowEndConsult(false);
    let cancelled = false;

    (async () => {
      const a = await api.get<{ appointment: Appointment }>(`/appointments/${appointmentId}`);
      if (cancelled) return;
      const [p, v, m] = await Promise.all([
        api.get<{ patient: Patient }>(`/patients/${a.appointment.patientId}`).catch(() => null),
        api.get<{ vitals: VitalLatest[] }>(`/vitals/latest?patientId=${a.appointment.patientId}`).catch(() => ({ vitals: [] })),
        api.get<{ meeting: Meeting }>(`/meetings?appointmentId=${appointmentId}`).catch(() => ({ meeting: null as unknown as Meeting })),
      ]);
      if (cancelled) return;
      if (p) {
        setPatient(p.patient);
        setPatientContext({
          id: p.patient.id, displayId: p.patient.uniquePatientId,
          name: `${p.patient.firstName} ${p.patient.lastName}`,
          initials: `${p.patient.firstName[0] ?? ""}${p.patient.lastName[0] ?? ""}`,
        });
      }
      setVitals(v.vitals);
      setMeeting(m.meeting ?? null);

      if (m.meeting) {
        const s = await api.get<{ summary: SummaryNote | null }>(`/clinical-notes/by-meeting/${m.meeting.id}`).catch(() => ({ summary: null }));
        if (cancelled) return;
        setSummary(s.summary);
        if (s.summary) {
          const parsed = parseNote(s.summary.note);
          setAssessment(parsed.assessment);
          setFindings(parsed.findings);
          setPlan(parsed.plan.length > 0 ? parsed.plan : [""]);
        }
      }
      setLoading(false);
    })().catch(() => setLoading(false));

    return () => { cancelled = true; setPatientContext(null); };
  }, [appointmentId, setPatientContext, setShowEndConsult]);

  const slaState = useMemo(() => derivePostConsultSlaState(meeting?.endedAt ?? null, !!summary), [meeting?.endedAt, summary]);
  const finalized = !!summary;

  async function finalize() {
    if (!patient || !meeting) return;
    setSaving(true);
    setError(null);
    try {
      const note = composeNote(assessment, findings, plan);
      const res = await api.post<SummaryNote>("/clinical-notes", {
        patientId: patient.id, note, recordType: "POST_CALL_SUMMARY", sourceMeetingId: meeting.id,
      });
      setSummary(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finalize summary");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-admin-body-sm text-admin-text-secondary">Loading…</p>;

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2 space-y-4">
        <Card className="border-admin-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-admin-h4 text-admin-text">Post-call Summary</p>
              <p className="mt-0.5 text-admin-body-sm text-admin-text-secondary">
                {patient ? `${patient.firstName} ${patient.lastName}` : ""}
              </p>
            </div>
            {finalized ? (
              <span className="flex items-center gap-1.5 rounded-admin-lg bg-admin-disabled px-3 py-1 text-admin-caption font-semibold text-admin-text-secondary">
                <Lock className="size-3.5" aria-hidden="true" /> Manual Entry — Finalized
              </span>
            ) : (
              <span className="rounded-admin-lg bg-admin-warning/15 px-3 py-1 text-admin-caption font-semibold text-admin-warning">
                Draft — Not Synced
              </span>
            )}
          </div>

          <Field label="Patient Assessment">
            <textarea
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              disabled={finalized}
              rows={3}
              className="w-full resize-none rounded-admin-sm border border-admin-border p-2.5 text-admin-body-sm text-admin-text disabled:bg-admin-disabled disabled:text-admin-text-secondary"
            />
          </Field>

          <Field label="Clinical Findings">
            <textarea
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              disabled={finalized}
              rows={3}
              className="w-full resize-none rounded-admin-sm border border-admin-border p-2.5 text-admin-body-sm text-admin-text disabled:bg-admin-disabled disabled:text-admin-text-secondary"
            />
          </Field>

          <Field label="Intervention & Plan">
            <ul className="space-y-2">
              {plan.map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-admin-text-secondary">•</span>
                  <input
                    value={item}
                    disabled={finalized}
                    onChange={(e) => setPlan((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))}
                    className="flex-1 rounded-admin-sm border border-admin-border px-2.5 py-1.5 text-admin-body-sm text-admin-text disabled:bg-admin-disabled disabled:text-admin-text-secondary"
                  />
                  {!finalized && plan.length > 1 && (
                    <button onClick={() => setPlan((prev) => prev.filter((_, idx) => idx !== i))} className="text-admin-text-secondary hover:text-admin-danger">
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!finalized && (
              <button onClick={() => setPlan((prev) => [...prev, ""])} className="mt-2 flex items-center gap-1 text-admin-caption text-admin-sidebar-cta hover:text-admin-sidebar-cta/80">
                <Plus className="size-3.5" aria-hidden="true" /> Add item
              </button>
            )}
          </Field>

          {error && <p className="mt-2 text-admin-body-sm text-admin-danger">{error}</p>}

          <div className="mt-5 flex items-center justify-end gap-3 border-t border-admin-border pt-4">
            <button
              disabled
              title="Notes are locked once synced to EHR — no separate draft-edit path exists in this build."
              className="rounded-admin-xs border border-admin-border px-4 py-2 text-admin-body-sm text-admin-text-secondary opacity-50"
            >
              Edit Draft
            </button>
            {finalized ? (
              <button
                onClick={() => navigate("/dashboard/consulting-oncologist")}
                className="rounded-admin-xs bg-admin-sidebar-cta px-4 py-2 text-admin-body-sm text-white hover:bg-admin-sidebar-cta/90"
              >
                Back to Scheduled Consultations
              </button>
            ) : (
              <button
                onClick={finalize}
                disabled={saving || !meeting || !assessment.trim()}
                className="flex items-center gap-2 rounded-admin-xs bg-admin-sidebar-cta px-4 py-2 text-admin-body-sm text-white hover:bg-admin-sidebar-cta/90 disabled:opacity-50"
              >
                <FileCheck2 className="size-4" aria-hidden="true" /> {saving ? "Syncing…" : "Sync to EHR & Finalize"}
              </button>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className={cn(
          "border-admin-border p-5",
          slaState === "breached" ? "border-2 border-admin-danger bg-admin-danger/5"
            : slaState === "warning" ? "border-2 border-admin-warning bg-admin-warning/5" : "",
        )}>
          <p className="flex items-center gap-1.5 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
            <Clock3 className="size-3.5" aria-hidden="true" /> Post-Consult SLA
          </p>
          {slaState === "not-applicable" ? (
            <p className="mt-2 text-admin-body-sm text-admin-text-secondary">No meeting record — SLA not tracked.</p>
          ) : slaState === "complete" ? (
            <p className="mt-2 text-admin-body font-semibold text-admin-success">Finalized ✓</p>
          ) : (
            <p className={cn(
              "mt-2 text-admin-h4",
              slaState === "breached" ? "text-admin-danger" : slaState === "warning" ? "text-admin-warning" : "text-admin-text",
            )}>
              {meeting?.endedAt ? formatCountdown(postConsultDeadlineMs(meeting.endedAt) - now) : "—"}
            </p>
          )}
          <p className="mt-1 text-admin-micro text-admin-text-secondary">24h to finalize once the call ends.</p>
        </Card>

        <Card className="border-admin-border p-5">
          <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Vitals During Session</p>
          {vitals.length === 0 ? (
            <p className="mt-2 text-admin-body-sm text-admin-text-secondary">No vitals recorded.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {vitals.map((v) => {
                const Icon = VITAL_ICON[v.vitalType] ?? Activity;
                return (
                  <div key={v.vitalType} className={cn("rounded-admin-sm p-3", v.severity === "ELEVATED" ? "bg-admin-warning/10" : "bg-admin-card-alt")}>
                    <p className="flex items-center gap-1.5 text-admin-micro font-semibold uppercase tracking-wide text-admin-text-secondary">
                      <Icon className="size-3" aria-hidden="true" /> {VITAL_LABELS[v.vitalType] ?? v.vitalType}
                    </p>
                    <p className="mt-1 text-admin-body font-semibold text-admin-text">
                      {v.value ?? "—"} <span className="text-admin-caption font-normal text-admin-text-secondary">{VITAL_UNITS[v.vitalType] ?? ""}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const VITAL_ICON: Record<string, typeof Heart> = { HEART_RATE_BPM: Heart, TEMPERATURE_C: Thermometer, SPO2_PERCENT: Droplets };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-admin-body-sm font-semibold text-admin-text">{label}</p>
      {children}
    </div>
  );
}
