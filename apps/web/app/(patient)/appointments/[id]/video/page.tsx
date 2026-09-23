"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Video, Clock, CircleCheck, CircleOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useCountdown } from "@/lib/useCountdown";
import type { Appointment, Meeting } from "@/lib/types";

// Video consultation page that joins the patient into their scheduled room.
export default function VideoConsultationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return <p className="p-6 text-center text-sm text-neutral-400">Loading…</p>;
  }

  if (error || !appointment) {
    return <p className="p-6 text-center text-sm text-critical">{error ?? "Appointment not found"}</p>;
  }

  const hostReady = meeting?.status === "IN_PROGRESS";
  const ended = meeting?.status === "ENDED" || appointment.status === "COMPLETED";

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
        ) : hostReady ? (
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-teal-bg text-teal">
              <CircleCheck className="size-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-teal">Your care team is ready</p>
            <Button
              className="w-full"
              href={`https://${meeting.roomId}.daily.co`}
              onClick={(e) => {
                e.preventDefault();
                window.open(`https://${meeting.roomId}.daily.co`, "_blank", "noreferrer");
              }}
            >
              <Video className="size-4" aria-hidden="true" /> Join Call
            </Button>
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-amber-bg text-amber">
              <Clock className="size-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-neutral-700">Waiting for your care team to join</p>
            {!countdown.isPast && (
              <p className="font-mono text-2xl font-bold text-amber">
                {String(countdown.days * 24 + countdown.hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:{String(countdown.seconds).padStart(2, "0")}
              </p>
            )}
            <p className="text-xs text-neutral-400">
              You&apos;ll be able to join as soon as your care team starts the call.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
