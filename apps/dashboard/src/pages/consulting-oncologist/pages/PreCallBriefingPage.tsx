import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MicOff, Video as VideoIcon, VideoOff, ShieldAlert, Heart, Thermometer, Droplets, Activity, Clock3, TriangleAlert } from "lucide-react";
import { api } from "../../../lib/api";
import type { Appointment, Patient, Meeting } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { cn } from "../../../lib/utils";
import { useConsultantShell } from "../ConsultantLayout";
import { type RegimenData, type VitalLatest, type CaseLockData, VITAL_LABELS, VITAL_UNITS } from "../lib/clinicalTypes";

// Phase 4 — waiting-room state before the patient joins. The room already exists (provisioned
// the same way the old VideoConsultStub did), and this screen's whole job is to prove "Waiting
// for Patient" is real: it polls Daily's own presence API (GET /meetings/:id/presence) rather
// than making the clinician guess when to click through to the Room. If DAILY_API_KEY isn't
// configured in this environment (a known, already-flagged infra gap), that poll fails honestly
// and this screen says so — it does not fabricate a "patient joined" transition.
const PRESENCE_POLL_MS = 4000;

export default function PreCallBriefingPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const { setPatientContext, setShowEndConsult } = useConsultantShell();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [regimen, setRegimen] = useState<RegimenData | null>(null);
  const [vitals, setVitals] = useState<VitalLatest[]>([]);
  const [caseLock, setCaseLock] = useState<CaseLockData | null>(null);
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!appointmentId) return;
    setShowEndConsult(true);
    let cancelled = false;

    api.get<{ appointment: Appointment }>(`/appointments/${appointmentId}`).then(async (d) => {
      if (cancelled) return;
      setAppointment(d.appointment);
      const [p, r, v, cl] = await Promise.all([
        api.get<{ patient: Patient }>(`/patients/${d.appointment.patientId}`).catch(() => null),
        api.get<{ regimen: RegimenData | null }>(`/regimen?patientId=${d.appointment.patientId}`).catch(() => ({ regimen: null })),
        api.get<{ vitals: VitalLatest[] }>(`/vitals/latest?patientId=${d.appointment.patientId}`).catch(() => ({ vitals: [] })),
        api.get<{ caseLock: CaseLockData | null }>(`/case-locks/active?patientId=${d.appointment.patientId}`).catch(() => ({ caseLock: null })),
      ]);
      if (cancelled) return;
      if (p) {
        setPatient(p.patient);
        setPatientContext({
          id: p.patient.id,
          displayId: p.patient.uniquePatientId,
          name: `${p.patient.firstName} ${p.patient.lastName}`,
          initials: `${p.patient.firstName[0] ?? ""}${p.patient.lastName[0] ?? ""}`,
        });
      }
      setRegimen(r.regimen);
      setVitals(v.vitals);
      setCaseLock(cl.caseLock);
    }).catch(() => {});

    // ONCOFLOW_SCHEDULING_AND_VIDEO_LIFECYCLE.md §3: "Consultant's Join Call no longer
    // provisions anything." Regional Admin's New Consultation flow (POST /consultations)
    // provisions the room at scheduling time now — this screen only ever reads. A missing
    // meeting here means this appointment predates that flow (or wasn't scheduled through it),
    // which is a real, honest state to surface, not something to paper over by creating one.
    (async () => {
      try {
        const existing = await api.get<{ meeting: Meeting }>(`/meetings?appointmentId=${appointmentId}`);
        if (!cancelled) setMeeting(existing.meeting);
      } catch (err) {
        if (!cancelled) {
          setProvisionError(
            err instanceof Error && err.message === "No meeting for this appointment"
              ? "No video room exists for this appointment — it wasn't scheduled through New Consultation."
              : err instanceof Error ? err.message : "Could not load the video room",
          );
        }
      }
    })();

    return () => { cancelled = true; setShowEndConsult(false); setPatientContext(null); };
  }, [appointmentId, setPatientContext, setShowEndConsult]);

  // The real "Waiting for Patient" mechanic — polls Daily's presence endpoint for this room and
  // navigates into the live Room (Phase 5) the moment anyone else connects. Stops polling once
  // it either succeeds in transitioning or hits a hard error (no point hammering a misconfigured
  // endpoint every 4s).
  useEffect(() => {
    if (!meeting || navigatedRef.current) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const presence = await api.get<{ count: number }>(`/meetings/${meeting.id}/presence`);
        if (cancelled || navigatedRef.current) return;
        setPresenceError(null);
        if (presence.count > 0) {
          navigatedRef.current = true;
          navigate(`/dashboard/consulting-oncologist/consult/${appointmentId}/room`);
        }
      } catch (err) {
        if (!cancelled) setPresenceError(err instanceof Error ? err.message : "Presence check failed");
      }
    }, PRESENCE_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [meeting, appointmentId, navigate]);

  const lastCompletedCycle = regimen?.cycles.filter((c) => c.status === "COMPLETED").sort((a, b) => b.cycleNumber - a.cycleNumber)[0];
  const age = patient ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 24 * 3600 * 1000)) : null;

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="col-span-2 flex flex-col items-center justify-center gap-4 border-admin-border p-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-admin-sidebar-cta/10">
          <VideoIcon className="size-7 text-admin-sidebar-cta" aria-hidden="true" />
        </div>
        <div>
          <p className="text-admin-h4 text-admin-text">Waiting for Patient</p>
          <p className="mt-1 text-admin-body-sm text-admin-text-secondary">
            The room is provisioned. This screen updates automatically the moment the patient's device connects.
          </p>
        </div>

        {provisionError ? (
          <p className="text-admin-body-sm text-admin-danger">{provisionError}</p>
        ) : !meeting ? (
          <p className="text-admin-body-sm text-admin-text-secondary">Loading room…</p>
        ) : (
          <div className="flex items-center gap-2 rounded-admin-sm border border-admin-success/30 bg-admin-success/10 px-4 py-2 text-admin-body-sm text-admin-success">
            <ShieldAlert className="size-4" aria-hidden="true" /> Room ready — {meeting.roomId}
          </div>
        )}

        {presenceError && (
          <p className="max-w-sm text-admin-caption text-admin-text-secondary">
            Live presence detection unavailable ({presenceError}). Enter the call manually once the patient confirms they've joined.
          </p>
        )}

        <div className="flex items-center gap-3 rounded-admin-lg border border-admin-border bg-admin-card-alt px-5 py-3">
          <button disabled className="flex size-9 items-center justify-center rounded-full bg-admin-disabled text-admin-text-secondary" title="Muted until the call starts">
            <MicOff className="size-4" aria-hidden="true" />
          </button>
          <button disabled className="flex size-9 items-center justify-center rounded-full bg-admin-disabled text-admin-text-secondary" title="Camera off until the call starts">
            <VideoOff className="size-4" aria-hidden="true" />
          </button>
        </div>

        {meeting && (
          <button
            onClick={() => { navigatedRef.current = true; navigate(`/dashboard/consulting-oncologist/consult/${appointmentId}/room`); }}
            className="text-admin-caption text-admin-sidebar-cta underline underline-offset-2 hover:text-admin-sidebar-cta/80"
          >
            Enter call room now
          </button>
        )}
      </Card>

      <div className="space-y-4">
        <Card className="border-admin-border p-5">
          <p className="text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">Pre-call Briefing</p>
          <dl className="mt-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <dt className="text-admin-body-sm text-admin-text-secondary">Consult Type</dt>
              <dd className="text-admin-body-sm font-medium text-admin-text">{appointment ? appointment.appointmentType.replace(/_/g, " ") : "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-admin-body-sm text-admin-text-secondary">Age</dt>
              <dd className="text-admin-body-sm font-medium text-admin-text">{age !== null ? `${age} years` : "—"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-admin-body-sm text-admin-text-secondary">Last Cycle</dt>
              <dd className="text-admin-body-sm font-medium text-admin-text">
                {lastCompletedCycle ? `Cycle ${lastCompletedCycle.cycleNumber} · ${new Date(lastCompletedCycle.scheduledDate).toLocaleDateString()}` : "None recorded"}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="border-admin-border p-5">
          <p className="flex items-center gap-1.5 text-admin-caption font-bold uppercase tracking-wide text-admin-text-secondary">
            <Clock3 className="size-3.5" aria-hidden="true" /> Latest Vitals
          </p>
          {vitals.length === 0 ? (
            <p className="mt-3 text-admin-body-sm text-admin-text-secondary">No vitals recorded yet.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {vitals.map((v) => (
                <VitalTile key={v.vitalType} vital={v} />
              ))}
            </div>
          )}
        </Card>

        <Card className={cn(
          "flex items-start gap-3 border-admin-border p-5",
          caseLock ? "border-2 border-admin-danger bg-admin-danger/5" : "bg-admin-card-alt",
        )}>
          <TriangleAlert className={cn("mt-0.5 size-5 shrink-0", caseLock ? "text-admin-danger" : "text-admin-text-secondary")} aria-hidden="true" />
          <div>
            <p className="text-admin-body-sm font-semibold text-admin-text">Next Action Recommendation</p>
            <p className="mt-0.5 text-admin-caption text-admin-text-secondary">
              {caseLock
                ? "Case is locked — cycle administration is blocked pending Clinical Director review. Do not proceed with treatment changes on this call."
                : "No outstanding clinical flags for this patient. Proceed with the scheduled consult."}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

const VITAL_ICONS: Record<string, typeof Heart> = {
  HEART_RATE_BPM: Heart, TEMPERATURE_C: Thermometer, SPO2_PERCENT: Droplets,
  BLOOD_PRESSURE_SYSTOLIC: Activity, BLOOD_PRESSURE_DIASTOLIC: Activity,
};

function VitalTile({ vital }: { vital: VitalLatest }) {
  const Icon = VITAL_ICONS[vital.vitalType] ?? Activity;
  return (
    <div className={cn("rounded-admin-sm p-3", vital.severity === "ELEVATED" ? "bg-admin-warning/10" : "bg-admin-card-alt")}>
      <p className="flex items-center gap-1.5 text-admin-micro font-semibold uppercase tracking-wide text-admin-text-secondary">
        <Icon className="size-3" aria-hidden="true" /> {VITAL_LABELS[vital.vitalType] ?? vital.vitalType}
      </p>
      <p className={cn("mt-1 text-admin-body font-semibold", vital.severity === "ELEVATED" ? "text-admin-warning" : "text-admin-text")}>
        {vital.value ?? "—"} <span className="text-admin-caption font-normal text-admin-text-secondary">{VITAL_UNITS[vital.vitalType] ?? ""}</span>
      </p>
      <p className="text-admin-micro text-admin-text-secondary">
        {vital.recordedAt ? `Updated ${new Date(vital.recordedAt).toLocaleString()}` : "Not recorded"}
      </p>
    </div>
  );
}
