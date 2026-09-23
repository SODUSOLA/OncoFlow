import type { CountdownCase } from "../../../lib/types";

export type CountdownCardStatus = "on-track" | "overdue-bloodwork" | "awaiting-consent" | "md-review-pending" | "infusion-ready" | "escalated";

// Shared by the Countdown page, layout bell and Notification Center so they agree on what counts as a breach.
export function deriveCountdownStatus(c: CountdownCase): CountdownCardStatus {
  if (c.status === "ESCALATED") return "escalated";
  if (!c.labsUploadedAt) return "overdue-bloodwork";
  if (!c.resultsSentToQaAt) return "md-review-pending";
  if (!c.paymentConfirmedAt) return "awaiting-consent";
  if (c.currentDay === 0) return "infusion-ready";
  return "on-track";
}

// True when the status is a breach (overdue bloodwork or escalated).
export function isCountdownBreached(status: CountdownCardStatus): boolean {
  return status === "overdue-bloodwork" || status === "escalated";
}
