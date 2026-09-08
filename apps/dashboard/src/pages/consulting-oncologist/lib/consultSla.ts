// Post-call Summary's SLA clock (Phase 6) — measured from Meeting.endedAt, the one timestamp the
// backend sets exactly once when Daily.co's webhook reports the call actually ended (see the
// column's comment in apps/api/src/modules/messaging/schema.ts). Not derived from `updatedAt`,
// which keeps moving on later mutations (transcript correction, sign-off).
export const POST_CONSULT_SLA_HOURS = 24;
export const POST_CONSULT_WARNING_HOURS = 18;

export type PostConsultSlaState = "not-applicable" | "on-track" | "warning" | "breached" | "complete";

export function derivePostConsultSlaState(endedAt: string | null, finalized: boolean): PostConsultSlaState {
  if (!endedAt) return "not-applicable";
  if (finalized) return "complete";
  const hoursSince = (Date.now() - new Date(endedAt).getTime()) / 3_600_000;
  if (hoursSince >= POST_CONSULT_SLA_HOURS) return "breached";
  if (hoursSince >= POST_CONSULT_WARNING_HOURS) return "warning";
  return "on-track";
}

export function formatCountdown(ms: number): string {
  const overdue = ms <= 0;
  const abs = Math.abs(ms);
  const hh = String(Math.floor(abs / 3_600_000)).padStart(2, "0");
  const mm = String(Math.floor(abs / 60_000) % 60).padStart(2, "0");
  return `${overdue ? "-" : ""}${hh}:${mm}`;
}

export function postConsultDeadlineMs(endedAt: string): number {
  return new Date(endedAt).getTime() + POST_CONSULT_SLA_HOURS * 3_600_000;
}
