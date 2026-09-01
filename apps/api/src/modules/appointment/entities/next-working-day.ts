import { checkWeeklyStructure } from "./weekly-structure.js";

// Advances scheduledAt to the next day (strictly after `from`'s Lagos calendar date) that
// checkWeeklyStructure (FR-20) allows for this appointmentType, preserving the original local
// time-of-day. Capped at 14 days out as a defensive bound against an unreachable type.
export function nextWorkingDayFor(appointmentType: string, scheduledAt: Date, from: Date): Date {
  for (let i = 1; i <= 14; i++) {
    const candidate = new Date(scheduledAt);
    candidate.setDate(candidate.getDate() + i);
    if (checkWeeklyStructure(appointmentType, candidate).allowed) {
      return candidate;
    }
  }
  throw new Error(`No valid working day found for ${appointmentType} within 14 days`);
}
