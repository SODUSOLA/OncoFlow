// Single source of truth for what counts as a breach or conflict, so every alert surface agrees on the thresholds.
export { deriveCountdownStatus, isCountdownBreached, type CountdownCardStatus } from "./countdownStatus";

// An open inquiry is breached once its last visitor message has gone this many minutes unanswered.
export const SLA_MINUTES = 5;
// Where the "approaching breach" warning state starts, the middle of the design system's three SLA states.
export const SLA_WARNING_MINUTES = 4;

export type SlaState = "normal" | "warning" | "breached";

// Classifies a wait time as normal, warning or breached.
export function classifyInquirySla(minutesSinceLastVisitorMessage: number): SlaState {
  if (minutesSinceLastVisitorMessage >= SLA_MINUTES) return "breached";
  if (minutesSinceLastVisitorMessage >= SLA_WARNING_MINUTES) return "warning";
  return "normal";
}

// True when the wait time has breached the SLA.
export function isInquiryBreached(minutesSinceLastVisitorMessage: number): boolean {
  return classifyInquirySla(minutesSinceLastVisitorMessage) === "breached";
}

// Staffing conflicts render as Critical, matching both the Scheduling card and the Notification Center mockup.
export function isStaffingConflict(day: { assigned: unknown[]; requiredCount: number }): boolean {
  return day.assigned.length < day.requiredCount;
}

export const WEEKDAY_NAMES: Record<number, string> = {
  1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday",
};
