// Membership prices from the company price list; SUBSCRIPTION has no tariff row, so these constants are the source.
export const SUBSCRIPTION_FEE_KOBO = {
  MONTHLY: 1_000_000n, // ₦10,000
  YEARLY: 10_000_000n, // ₦100,000
} as const;

export type SubscriptionCycle = keyof typeof SUBSCRIPTION_FEE_KOBO;

// A subscription is prepaid for one term and renewed by paying again; it can be renewed this many days before it ends.
export const RENEWAL_WINDOW_DAYS = 14;

// Today's calendar date in Africa/Lagos as YYYY-MM-DD.
export function lagosToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Adds whole days to a YYYY-MM-DD date.
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The date the next term ends/bills, one calendar month or year after `from` (clamped to month end).
export function nextBillingDate(from: string, cycle: SubscriptionCycle): string {
  const d = new Date(`${from}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  if (cycle === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}
