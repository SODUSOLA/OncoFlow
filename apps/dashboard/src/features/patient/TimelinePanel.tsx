import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { TimelineEvent } from "../../lib/types";

const EVENT_LABELS: Record<TimelineEvent["eventType"], string> = {
  REGISTRATION: "Registered",
  STATUS_CHANGE: "Status Changed",
  CONSULTATION: "Consultation",
  APPOINTMENT: "Appointment",
  INVOICE: "Invoice",
  WALLET: "Wallet Activity",
};

// Shows a patient's timeline events.
export function TimelinePanel({ patientId }: { patientId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ events: TimelineEvent[] }>(`/patients/${patientId}/timeline`)
      .then((res) => setEvents(res.events))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load timeline"))
      .finally(() => setLoading(false));
  }, [patientId]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">My Timeline</h2>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-500 text-sm">{error}</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No timeline events yet</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {events.map((e) => (
              <li key={e.id} className="px-6 py-4 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{EVENT_LABELS[e.eventType]}</span>
                <span className="text-xs text-gray-400">{new Date(e.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
