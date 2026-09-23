// Africa/Lagos has no DST and is fixed at UTC+1, so a Lagos calendar day ends at the next day's 00:00+01:00.
const DAY_MS = 24 * 60 * 60 * 1000;

// Returns the instant a Lagos calendar day ends (exclusive), for "stock as of that day" ledger sums.
export function endOfLagosDay(date: string): Date {
  return new Date(new Date(`${date}T00:00:00+01:00`).getTime() + DAY_MS);
}

// Returns today's Lagos calendar date as YYYY-MM-DD.
export function lagosToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}
