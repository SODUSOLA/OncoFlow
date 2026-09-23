// Side-effect fee varies by time of day in Africa/Lagos, with the night rate (8pm–6am) higher because overnight VMO cover costs more.
const DAY_FEE_KOBO = 300_000n; // ₦3,000
const NIGHT_FEE_KOBO = 500_000n; // ₦5,000

// Returns the hour (0-23) of a timestamp in Africa/Lagos.
function lagosHour(timestamp: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", hour: "numeric", hour12: false,
  }).formatToParts(timestamp);
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  return hour === 24 ? 0 : hour;
}

// True when the timestamp falls in the night-rate hours.
export function isNightRate(timestamp: Date = new Date()): boolean {
  const hour = lagosHour(timestamp);
  return hour >= 20 || hour < 6;
}

// Returns the side-effect report fee in kobo for the timestamp's rate.
export function sideEffectReportFeeKobo(timestamp: Date = new Date()): bigint {
  return isNightRate(timestamp) ? NIGHT_FEE_KOBO : DAY_FEE_KOBO;
}

export { DAY_FEE_KOBO, NIGHT_FEE_KOBO };
