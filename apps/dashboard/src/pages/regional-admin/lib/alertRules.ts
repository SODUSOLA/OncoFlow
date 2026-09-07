// Shared classification thresholds — the single source of truth for "what counts as a breach
// or conflict," per ONCOFLOW_REGIONAL_ADMIN_BUILD_GUIDE.md's cross-cutting rule for Phases
// 2/3/5/6/7: every alert-producing surface must agree on these, not invent its own threshold.
export { deriveCountdownStatus, isCountdownBreached, type CountdownCardStatus } from "./countdownStatus";

// An open public inquiry counts as breached once its last unanswered visitor message has sat
// this many minutes without a staff reply. Used identically by the Inquiry Chat Inbox's own
// per-thread countdown and the shared alert aggregator's inquiry alerts.
export const SLA_MINUTES = 5;
// The design system's "SLA countdown/badge" component (item 5) has 3 states, not 2 — normal,
// warning (~5min, i.e. approaching breach), breached. This is where "approaching" starts.
export const SLA_WARNING_MINUTES = 4;

export type SlaState = "normal" | "warning" | "breached";

export function classifyInquirySla(minutesSinceLastVisitorMessage: number): SlaState {
  if (minutesSinceLastVisitorMessage >= SLA_MINUTES) return "breached";
  if (minutesSinceLastVisitorMessage >= SLA_WARNING_MINUTES) return "warning";
  return "normal";
}

export function isInquiryBreached(minutesSinceLastVisitorMessage: number): boolean {
  return classifyInquirySla(minutesSinceLastVisitorMessage) === "breached";
}

// Staffing conflicts render as CRITICAL (not a lesser "warning") — both Scheduling's own
// "Critical Shortages" card and the Notification Center mockup place scheduling conflicts in
// the red/Critical column, not the amber/Pending one.
export function isStaffingConflict(day: { assigned: unknown[]; requiredCount: number }): boolean {
  return day.assigned.length < day.requiredCount;
}

export const WEEKDAY_NAMES: Record<number, string> = {
  1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday",
};
