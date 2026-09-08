import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Appointment, Meeting } from "../../lib/types";

function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [checked, setChecked] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ meeting: Meeting }>(`/meetings?appointmentId=${appointment.id}`)
      .then((res) => setMeeting(res.meeting))
      .catch(() => setMeeting(null))
      .finally(() => setChecked(true));
  }, [appointment.id]);

  // ONCOFLOW_SCHEDULING_AND_VIDEO_LIFECYCLE.md §3: "the patient never constructs a room URL or
  // joins ad-hoc" — this used to build `https://${meeting.roomId}.daily.co` directly, which was
  // never even the right shape for a Daily room URL (that's `https://<team-domain>.daily.co/
  // <room-name>`, and the team domain isn't derivable client-side). Now it asks the real token
  // endpoint for a join-ready URL, which also enforces this patient is an actual invited
  // participant on this appointment (MeetingService.issueToken).
  async function joinCall() {
    if (!meeting) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await api.post<{ roomUrl: string; token: string }>(`/meetings/${meeting.id}/token`, {});
      window.open(`${res.roomUrl}?t=${encodeURIComponent(res.token)}`, "_blank", "noreferrer");
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Could not join this call");
    } finally {
      setJoining(false);
    }
  }

  return (
    <li className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-gray-800">{new Date(appointment.scheduledAt).toLocaleString()}</p>
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{appointment.status}</span>
        {joinError && <p className="mt-1 text-xs text-red-500">{joinError}</p>}
      </div>
      {!checked ? (
        <span className="text-xs text-gray-400">Checking...</span>
      ) : meeting ? (
        <button
          onClick={joinCall}
          disabled={joining}
          className="px-3 py-1.5 bg-ink text-white rounded-lg hover:bg-ink-600 text-xs font-medium disabled:opacity-50"
        >
          {joining ? "Joining…" : `Join Call (${meeting.status})`}
        </button>
      ) : (
        <span className="text-xs text-gray-400">Room not set up yet</span>
      )}
    </li>
  );
}

export function VideoConsultPanel({ patientId }: { patientId: string }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ appointments: Appointment[] }>(`/appointments?patientId=${patientId}`)
      .then((res) => setAppointments(res.appointments.filter((a) => a.appointmentType === "VIRTUAL")))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load appointments"))
      .finally(() => setLoading(false));
  }, [patientId]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Video Consultations</h2>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-500 text-sm">{error}</div>
        ) : appointments.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No scheduled video consultations</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {appointments.map((a) => (
              <AppointmentRow key={a.id} appointment={a} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
