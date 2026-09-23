// True when the timestamp falls at or after 2PM in Africa/Lagos.
export function isAfter2pmNigeria(timestamp: Date): boolean {
  const lagos = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    hour: "numeric",
    hour12: false,
  }).formatToParts(timestamp);
  const hour = Number(lagos.find((p) => p.type === "hour")!.value);
  return hour >= 14;
}

// Whether an appointment can still be confirmed today: only on its own scheduled Lagos calendar day.
export function canConfirmOnDay(scheduledAt: Date, now: Date): { allowed: boolean; reason?: string } {
  const sched = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(scheduledAt);

  const current = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);

  const schedDate = new Date(sched);
  const currentDate = new Date(current);

  const diffDays = Math.round((schedDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { allowed: false, reason: "Scheduled date is in the past" };
  }
  if (diffDays === 0 && isAfter2pmNigeria(now)) {
    return { allowed: false, reason: "Past 2PM cutoff — cannot confirm same-day appointments" };
  }
  return { allowed: true };
}
