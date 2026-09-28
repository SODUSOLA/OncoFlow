"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Video, Clock, CircleOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useCountdown } from "@/lib/useCountdown";
import { useMyPatient } from "@/lib/useMyPatient";
import { useDailyCall } from "@/lib/useDailyCall";
import { RemoteVideoTile } from "@/components/video/RemoteVideoTile";
import { LocalVideoPiP } from "@/components/video/LocalVideoPiP";
import { VideoHUD } from "@/components/video/VideoHUD";
import { ControlBar } from "@/components/video/ControlBar";
import type { Appointment, Meeting } from "@/lib/types";

// Video consultation page. Joins the patient into their scheduled Daily room through the same role-scoped
// token endpoint (POST /meetings/:meetingId/token) the staff dashboard's consultant video room uses — not a
// raw, unauthenticated room link, which a token-gated room would refuse anyway.
export default function VideoConsultationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { patient } = useMyPatient();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tokenInfo, setTokenInfo] = useState<{ token: string; roomUrl: string } | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const apptRes = await api.get<{ appointment: Appointment }>(`/appointments/${params.id}`);
        setAppointment(apptRes.appointment);
        try {
          const meetingRes = await api.get<{ meeting: Meeting }>(`/meetings?appointmentId=${params.id}`);
          setMeeting(meetingRes.meeting);
        } catch {
          setMeeting(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load appointment");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  const countdown = useCountdown(appointment?.scheduledAt ?? null);
  const userName = patient ? `${patient.firstName} ${patient.lastName}`.trim() : "Patient";
  const call = useDailyCall(tokenInfo?.roomUrl ?? null, tokenInfo?.token ?? null, userName);

  // Requests a role-scoped join token for this meeting and starts the call. A deliberate tap (not an
  // auto-join on page load) since joining asks the browser for camera/mic permission.
  async function joinCall() {
    if (!meeting) return;
    setJoining(true);
    setJoinError(null);
    try {
      const tok = await api.post<{ token: string; roomUrl: string }>(`/meetings/${meeting.id}/token`, { userName });
      setTokenInfo({ token: tok.token, roomUrl: tok.roomUrl });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Could not obtain a call token");
    } finally {
      setJoining(false);
    }
  }

  // Leaving only ends the patient's own participation — POST /meetings/:id/end (which closes the meeting for
  // everyone) is reserved for the assigned consultant, per the API's own authorization rule.
  function leaveCall() {
    call.leave();
    setTokenInfo(null);
  }

  if (loading) {
    return <p className="p-6 text-center text-sm text-neutral-400">Loading…</p>;
  }

  if (error || !appointment) {
    return <p className="p-6 text-center text-sm text-critical">{error ?? "Appointment not found"}</p>;
  }

  const ended = meeting?.status === "ENDED" || appointment.status === "COMPLETED";

  // In-call: the embedded video UI (once a token has been issued and the call object is connecting or joined).
  if (tokenInfo && call.status !== "left") {
    return (
      <div className="flex h-dvh flex-col bg-neutral-950 p-3 sm:p-4">
        <div className="relative min-h-0 flex-1 rounded-2xl">
          <RemoteVideoTile participant={call.remoteParticipants[0] ?? null} />
          <VideoHUD status={call.status} durationSec={call.durationSec} />
          <LocalVideoPiP videoTrack={call.localVideoTrack} />
          <ControlBar
            audioOn={call.localAudioOn}
            videoOn={call.localVideoOn}
            onToggleAudio={call.toggleAudio}
            onToggleVideo={call.toggleVideo}
            onLeave={leaveCall}
          />
          {call.status === "joining" && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-neutral-950/70 text-sm text-white">
              Connecting to the call…
            </div>
          )}
          {call.status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-neutral-950/85 px-8 text-center text-sm text-white">
              <p className="font-semibold">Call connection failed</p>
              <p className="text-white/70">{call.error}</p>
              <Button className="mt-2" onClick={() => setTokenInfo(null)}>Back</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Pre-join screen (also shown again after leaving, so rejoining a still-open room needs no back-navigation).
  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="size-5 text-neutral-500" />
        </button>
        <h1 className="text-lg font-bold text-neutral-900">Video Consultation</h1>
      </div>

      <Card className="text-center">
        <p className="text-sm text-neutral-500">
          {new Date(appointment.scheduledAt).toLocaleDateString(undefined, {
            weekday: "long", month: "long", day: "numeric",
          })}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-neutral-700">
          {new Date(appointment.scheduledAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </p>

        {ended ? (
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <CircleOff className="size-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-neutral-600">This consultation has ended</p>
          </div>
        ) : !meeting ? (
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <Video className="size-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-neutral-600">Room not set up yet</p>
            <p className="text-xs text-neutral-400">Your care team will provision the video room before your appointment.</p>
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-teal-bg text-teal">
              <Video className="size-6" aria-hidden="true" />
            </div>
            {!countdown.isPast && (
              <div className="flex items-center gap-1.5 text-amber">
                <Clock className="size-4" aria-hidden="true" />
                <p className="font-mono text-lg font-bold">
                  {String(countdown.days * 24 + countdown.hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:{String(countdown.seconds).padStart(2, "0")}
                </p>
              </div>
            )}
            <Button className="w-full" loading={joining} onClick={joinCall}>
              <Video className="size-4" aria-hidden="true" /> Join Call
            </Button>
            <p className="text-xs text-neutral-400">
              You can join early and wait — your care team will appear as soon as they connect.
            </p>
            {joinError && <p className="text-xs text-critical">{joinError}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
