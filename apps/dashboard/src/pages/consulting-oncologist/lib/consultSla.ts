// Post-call summary SLA in hours, measured from Meeting.endedAt (set once by Daily's webhook), not updatedAt which keeps changing.
export const POST_CONSULT_SLA_HOURS = 24;
export const POST_CONSULT_WARNING_HOURS = 18;

export type PostConsultSlaState = "not-applicable" | "on-track" | "warning" | "breached" | "complete";

// Derives the post-consult SLA state from the call end time and whether the summary is finalized.
export function derivePostConsultSlaState(endedAt: string | null, finalized: boolean): PostConsultSlaState {
  if (!endedAt) return "not-applicable";
  if (finalized) return "complete";
  const hoursSince = (Date.now() - new Date(endedAt).getTime()) / 3_600_000;
  if (hoursSince >= POST_CONSULT_SLA_HOURS) return "breached";
  if (hoursSince >= POST_CONSULT_WARNING_HOURS) return "warning";
  return "on-track";
}

// Formats milliseconds as a countdown, or as overdue when negative.
export function formatCountdown(ms: number): string {
  const overdue = ms <= 0;
  const abs = Math.abs(ms);
  const hh = String(Math.floor(abs / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor(abs / 60_000) % 60).padStart(2, "0");
  return `${overdue ? "-" : ""}${hh}:${mm}`;
}

// Returns the SLA deadline timestamp in milliseconds for a call end time.
export function postConsultDeadlineMs(endedAt: string): number {
  return new Date(endedAt).getTime() + POST_CONSULT_SLA_HOURS * 3_600_000;
}
