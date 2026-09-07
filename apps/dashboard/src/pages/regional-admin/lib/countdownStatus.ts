import type { CountdownCase } from "../../../lib/types";

export type CountdownCardStatus = "on-track" | "overdue-bloodwork" | "awaiting-consent" | "md-review-pending" | "infusion-ready" | "escalated";

// Shared by CountdownPage (rendering) and RegionalAdminLayout / NotificationCenterPage (the
// real SLA-breach signal surfaced in the bell dot and the Notification Center's Critical
// column) — one definition so the three can't drift out of sync on what counts as a breach.
export function deriveCountdownStatus(c: CountdownCase): CountdownCardStatus {
  if (c.status === "ESCALATED") return "escalated";
  if (!c.labsUploadedAt) return "overdue-bloodwork";
  if (!c.resultsSentToQaAt) return "md-review-pending";
  if (!c.paymentConfirmedAt) return "awaiting-consent";
  if (c.currentDay === 0) return "infusion-ready";
  return "on-track";
}

export function isCountdownBreached(status: CountdownCardStatus): boolean {
  return status === "overdue-bloodwork" || status === "escalated";
}
