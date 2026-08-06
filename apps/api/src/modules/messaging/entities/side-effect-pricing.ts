// Side-effect report fee varies by time of day, evaluated in the facility's local time
// (Africa/Lagos, same convention as the appointment module's weekly-structure rule) — not the
// server's/caller's time zone. Night hours cost more because staffing a Virtual Medical
// Officer overnight (8pm–6am) is the more expensive shift to cover.
const DAY_FEE_KOBO = 300_000n; // ₦3,000
const NIGHT_FEE_KOBO = 500_000n; // ₦5,000

function lagosHour(timestamp: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", hour: "numeric", hour12: false,
  }).formatToParts(timestamp);
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  return hour === 24 ? 0 : hour;
}

export function isNightRate(timestamp: Date = new Date()): boolean {
  const hour = lagosHour(timestamp);
  return hour >= 20 || hour < 6;
}

export function sideEffectReportFeeKobo(timestamp: Date = new Date()): bigint {
  return isNightRate(timestamp) ? NIGHT_FEE_KOBO : DAY_FEE_KOBO;
}

export { DAY_FEE_KOBO, NIGHT_FEE_KOBO };
