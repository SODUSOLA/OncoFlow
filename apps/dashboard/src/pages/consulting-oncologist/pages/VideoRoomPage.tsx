import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import type { Appointment, Patient, Meeting } from "../../../lib/types";
import { Card } from "../../../components/ui/Card";
import { useConsultantShell } from "../ConsultantLayout";
import { type CaseLockData, type VitalLatest } from "../lib/clinicalTypes";
import { useDailyCall } from "../video/useDailyCall";
import { RemoteVideoTile } from "../video/RemoteVideoTile";
import { LocalVideoPiP } from "../video/LocalVideoPiP";
import { VideoHUD } from "../video/VideoHUD";
import { ControlBar } from "../video/ControlBar";
import { SafetyCheckBanner } from "../video/SafetyCheckBanner";
import { TranscriptPanel } from "../video/TranscriptPanel";
import { ClinicalObservationsInput } from "../video/ClinicalObservationsInput";

// Phase 5 — the actual call, per the build guide's ADR: a custom daily-js Call Object wrapper
// (useDailyCall), not Daily Prebuilt. Mic/camera/leave are wired to the real call object; the
// Safety Check banner and Clinical Observations input are deliberately independent of it (they
// read patient data, not video state).
export default function VideoRoomPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setPatientContext, setShowEndConsult } = useConsultantShell();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [caseLock, setCaseLock] = useState<CaseLockData | null>(null);
  const [vitals, setVitals] = useState<VitalLatest[]>([]);
  const [tokenInfo, setTokenInfo] = useState<{ token: string; roomUrl: string } | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (!appointmentId) return;
    setShowEndConsult(true);
    let cancelled = false;

    (async () => {
      const a = await api.get<{ appointment: Appointment }>(`/appointments/${appointmentId}`);
      if (cancelled) return;

      const [p, cl, v] = await Promise.all([
        api.get<{ patient: Patient }>(`/patients/${a.appointment.patientId}`).catch(() => null),
        api.get<{ caseLock: CaseLockData | null }>(`/case-locks/active?patientId=${a.appointment.patientId}`).catch(() => ({ caseLock: null })),
        api.get<{ vitals: VitalLatest[] }>(`/vitals/latest?patientId=${a.appointment.patientId}`).catch(() => ({ vitals: [] })),
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
      setCaseLock(cl.caseLock);
      setVitals(v.vitals);

      // §3: no lazy provisioning here either — Regional Admin's New Consultation flow already
      // created this room at scheduling time. Reaching this screen without one existing means
      // this appointment predates that flow.
      let meetingRow: Meeting;
      try {
        const existing = await api.get<{ meeting: Meeting }>(`/meetings?appointmentId=${appointmentId}`);
        meetingRow = existing.meeting;
      } catch (err) {
        if (!cancelled) {
          setTokenError(
            err instanceof Error && err.message === "No meeting for this appointment"
              ? "No video room exists for this appointment — it wasn't scheduled through New Consultation."
              : err instanceof Error ? err.message : "Could not load the video room",
          );
        }
        return;
      }
      if (cancelled) return;
      setMeeting(meetingRow);

      try {
        const tok = await api.post<{ token: string; roomUrl: string }>(`/meetings/${meetingRow.id}/token`, {
          userName: user?.email ? `Dr. ${user.email.split("@")[0]}` : "Consulting Oncologist",
        });
        if (!cancelled) setTokenInfo({ token: tok.token, roomUrl: tok.roomUrl });
      } catch (err) {
        if (!cancelled) setTokenError(err instanceof Error ? err.message : "Could not obtain a call token");
      }
    })().catch(() => {});

    return () => { cancelled = true; setShowEndConsult(false); setPatientContext(null); };
  }, [appointmentId, setPatientContext, setShowEndConsult, user?.email]);

  const call = useDailyCall(tokenInfo?.roomUrl ?? null, tokenInfo?.token ?? null, user?.email ? `Dr. ${user.email.split("@")[0]}` : "Consulting Oncologist");

  async function endCall() {
    setEnding(true);
    call.leave();
    // Marks the meeting ENDED from the clinician's own action, not only via Daily's webhook —
    // see MeetingService.endCall's comment for why relying on the webhook alone would leave
    // Phase 6's post-consult SLA clock permanently inert in an environment with no public
    // webhook URL. Best-effort: navigating to the summary should never hang on this.
    if (meeting) await api.post(`/meetings/${meeting.id}/end`, {}).catch(() => {});
    navigate(`/dashboard/consulting-oncologist/consult/${appointmentId}/summary`);
  }

  if (tokenError) {
    return (
      <Card className="mx-auto flex max-w-lg flex-col items-center gap-3 border-admin-border px-8 py-14 text-center">
        <p className="text-admin-h4 text-admin-danger">Could not connect to the video room</p>
        <p className="text-admin-body-sm text-admin-text-secondary">{tokenError}</p>
        <p className="text-admin-caption text-admin-text-secondary">
          This usually means DAILY_API_KEY / DAILY_DOMAIN aren't configured on the API in this environment.
        </p>
        <button
          onClick={() => navigate(`/dashboard/consulting-oncologist/consult/${appointmentId}/summary`)}
          className="mt-1 rounded-admin-xs border border-admin-sidebar-cta px-4 py-2 text-admin-body-sm text-admin-sidebar-cta hover:bg-admin-card-alt"
        >
          Continue to Post-call Summary
        </button>
      </Card>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-4">
      <div className="relative col-span-2 min-h-0 rounded-admin-lg">
        <RemoteVideoTile participant={call.remoteParticipants[0] ?? null} />
        <VideoHUD status={call.status} durationSec={call.durationSec} />
        <SafetyCheckBanner caseLock={caseLock} vitals={vitals} />
        <LocalVideoPiP videoTrack={call.localVideoTrack} />
        <ControlBar
          audioOn={call.localAudioOn}
          videoOn={call.localVideoOn}
          onToggleAudio={call.toggleAudio}
          onToggleVideo={call.toggleVideo}
          onEndCall={endCall}
        />
        {call.status === "joining" && !ending && (
          <div className="absolute inset-0 flex items-center justify-center rounded-admin-lg bg-[#0B1220]/70 text-admin-body-sm text-white">
            Connecting to the call…
          </div>
        )}
        {call.status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-admin-lg bg-[#0B1220]/85 px-8 text-center text-admin-body-sm text-white">
            <p className="font-semibold">Call connection failed</p>
            <p className="text-white/70">{call.error}</p>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-4">
        <Card className="min-h-0 flex-1 overflow-hidden border-admin-border p-0">
          {meeting ? <TranscriptPanel meetingId={meeting.id} live={call.status === "joined"} /> : null}
        </Card>
        {patient && <ClinicalObservationsInput patientId={patient.id} />}
      </div>
    </div>
  );
}
