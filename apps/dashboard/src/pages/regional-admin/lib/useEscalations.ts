import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { getSocket } from "../../../lib/socket";

export type EscalationStatus = "NOTIFIED" | "CONSULT_SCHEDULED" | "RESOLVED";
export interface Escalation {
  id: string; patientId: string; status: EscalationStatus; triggerReason: string; createdAt: string; updatedAt: string;
  firstName: string; lastName: string; uniquePatientId: string; facilityId: string;
  escalatorFirstName: string | null; escalatorLastName: string | null; escalatorEmail: string;
}

// Region-scoped VMO escalations. Refreshes live when a SPECIALIST_ESCALATION notification arrives over the socket.
export function useEscalations() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setEscalations((await api.get<{ escalations: Escalation[] }>("/escalations")).escalations);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load escalations");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void reload();
    const socket = getSocket();
    const onNotification = (n: { type?: string }) => { if (n.type === "SPECIALIST_ESCALATION") void reload(); };
    socket.on("notification:new", onNotification);
    return () => { socket.off("notification:new", onNotification); };
  }, [reload]);

  // Moves an escalation forward; the server validates the transition and the region.
  async function advance(id: string, status: "CONSULT_SCHEDULED" | "RESOLVED") {
    await api.patch(`/escalations/${id}/status`, { status });
    await reload();
  }

  return { escalations, loading, error, reload, advance };
}
