// FR-20 weekly structure: Mon/Wed/Fri for virtual consults and chemo, Tue/Thu for procedures and physical consults, in Africa/Lagos time.
const MON_WED_FRI_TYPES = new Set(["VIRTUAL", "CHEMOTHERAPY"]);
const TUE_THU_TYPES = new Set(["PHYSICAL", "PROCEDURE"]);

// Day of week (0-6) of the timestamp in Africa/Lagos.
function lagosDayOfWeek(timestamp: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    weekday: "short",
  }).formatToParts(timestamp);
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

// Checks an appointment type against the FR-20 weekly structure for its Lagos day.
export function checkWeeklyStructure(
  appointmentType: string,
  scheduledAt: Date,
): { allowed: boolean; reason?: string } {
  const day = lagosDayOfWeek(scheduledAt);
  const isMonWedFri = day === 1 || day === 3 || day === 5;
  const isTueThu = day === 2 || day === 4;

  if (MON_WED_FRI_TYPES.has(appointmentType) && !isMonWedFri) {
    return { allowed: false, reason: `${appointmentType} sessions can only be scheduled Mon/Wed/Fri` };
  }
  if (TUE_THU_TYPES.has(appointmentType) && !isTueThu) {
    return { allowed: false, reason: `${appointmentType} sessions can only be scheduled Tue/Thu` };
  }
  return { allowed: true };
}
