import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { useCountdown } from "../../../lib/useCountdown";
import { cn } from "../../../lib/utils";

export type SlaState = "CRITICAL" | "WARNING" | "STABLE" | "RESOLVED";

export interface InboxChat {
  id: string;
  status: "OPEN" | "CLOSED";
  slaState: SlaState;
  slaDeadline: string | null;
  createdAt: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  triageCompleted: boolean;
  unreadCount?: number;
  patient: { firstName: string; lastName: string; uniquePatientId: string; age: number };
}

export interface TriageQuestion {
  id: string; position: number; prompt: string; impactContext: string;
  affirmativeLabel: string; negativeLabel: string;
  protocolReference: string; differentialDiagnosis: string; requiredEvidence: string;
  answer: boolean | null;
}
export interface TriageState {
  sessionId: string; conversationId: string; completed: boolean; answered: number; total: number; questions: TriageQuestion[];
}

// Loads the VMO's chats; `reload` refreshes after an action.
export function useInbox() {
  const [chats, setChats] = useState<InboxChat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setChats((await api.get<{ conversations: InboxChat[] }>("/vmo/inbox")).conversations);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your chats");
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { chats, error, reload };
}

export interface UnclaimedChat {
  id: string;
  slaState: SlaState;
  slaDeadline: string | null;
  createdAt: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount?: number;
  patient: { firstName: string; lastName: string; uniquePatientId: string; age: number };
}

// Side-effect reports no VMO has taken yet; refreshes on its own so a new report appears without a reload.
export function useUnclaimed() {
  const [chats, setChats] = useState<UnclaimedChat[] | null>(null);
  const reload = useCallback(async () => {
    try {
      setChats((await api.get<{ conversations: UnclaimedChat[] }>("/vmo/unclaimed")).conversations);
    } catch {
      setChats((prev) => prev ?? []);
    }
  }, []);
  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 15_000);
    return () => clearInterval(t);
  }, [reload]);
  return { chats, reload };
}

export const SLA_STYLE: Record<SlaState, { label: string; bar: string; badge: string }> = {
  CRITICAL: { label: "SLA critical", bar: "border-l-4 border-l-admin-danger bg-red-50/60", badge: "bg-admin-danger text-white" },
  WARNING: { label: "Warning", bar: "border-l-4 border-l-admin-warning", badge: "bg-admin-warning text-white" },
  STABLE: { label: "Stable", bar: "border-l-4 border-l-admin-success", badge: "bg-admin-success/15 text-admin-success" },
  RESOLVED: { label: "Resolved", bar: "border-l-4 border-l-admin-border opacity-70", badge: "bg-admin-disabled text-admin-text-secondary" },
};

// Live countdown to the SLA deadline; past it shows the overrun as -MM:SS.
export function SlaCountdown({ deadline, state, className }: { deadline: string | null; state: SlaState; className?: string }) {
  const { isPast } = useCountdown(deadline);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!deadline || state === "RESOLVED") return null;
  const diff = new Date(deadline).getTime() - now;
  const abs = Math.abs(diff);
  const mm = String(Math.floor(abs / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((abs % 60_000) / 1000)).padStart(2, "0");
  return (
    <span className={cn("font-mono tabular-nums", (isPast || diff < 0) && state === "CRITICAL" ? "text-admin-danger font-bold" : "", className)}>
      {diff < 0 ? "-" : ""}{mm}:{ss}
    </span>
  );
}

export function SlaBadge({ state }: { state: SlaState }) {
  return <span className={cn("rounded-admin-xs px-2 py-0.5 text-admin-micro font-semibold uppercase", SLA_STYLE[state].badge)}>{SLA_STYLE[state].label}</span>;
}

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

// ---- Gated folder ----
import type { RegimenData, ClinicalMetricsSnapshot, VitalLatest } from "../../consulting-oncologist/lib/clinicalTypes";

export interface LabValueRow { analyteCode: string; displayName: string; unit: string; value: number; normalLow: number; normalHigh: number; outOfRange: boolean }
export interface FolderData {
  patient: { id: string; uniquePatientId: string; firstName: string; lastName: string; dob: string; gender: string };
  regimen: RegimenData | null;
  vitals: VitalLatest[];
  clinicalMetrics: (ClinicalMetricsSnapshot & { labValues: LabValueRow[] }) | null;
}

// Loads the folder; `locked` is true when the server refuses because the checklist isn't finished.
export function useFolder(conversationId: string | undefined) {
  const [folder, setFolder] = useState<FolderData | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!conversationId) return;
    setFolder(null); setLocked(false); setError(null);
    api.get<FolderData>(`/vmo/conversations/${conversationId}/folder`)
      .then(setFolder)
      .catch((e: Error) => (e.message.includes("triage checklist") ? setLocked(true) : setError(e.message)));
  }, [conversationId]);
  return { folder, locked, error };
}

export interface MedicationCards {
  drugsUsed: { id: string; drugName: string; drugStrength: string | null; quantityUsed: number; usedAt: string }[];
  vitalTimelines: { vitalType: string; readings: { id: string; value: number; recordedAt: string }[] }[];
}

// Medication Triage's read-aggregation, keyed by card so more cards can be added without reshaping this.
export function useMedicationTriage(conversationId: string | undefined) {
  const [cards, setCards] = useState<MedicationCards | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!conversationId) return;
    api.get<{ cards: { key: string; data: unknown }[] }>(`/vmo/conversations/${conversationId}/medication-triage`)
      .then((r) => setCards(Object.fromEntries(r.cards.map((c) => [c.key, c.data])) as unknown as MedicationCards))
      .catch((e: Error) => setError(e.message));
  }, [conversationId]);
  return { cards, error };
}
