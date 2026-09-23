import { checkWeeklyStructure } from "./weekly-structure.js";

// Advances to the next Lagos day after `from` that the weekly structure allows for this type, keeping the time of day; capped at 14 days.
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
