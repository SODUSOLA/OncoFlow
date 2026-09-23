// Client-side preview only; the server computes and charges the authoritative amount.
const DAY_FEE_KOBO = "300000";
const NIGHT_FEE_KOBO = "500000";

// True when the current Lagos time is in the night-rate hours.
export function isNightRateNow(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", hour: "numeric", hour12: false }).format(new Date()),
  );
  const normalized = hour === 24 ? 0 : hour;
  return normalized >= 20 || normalized < 6;
}

// Returns the current side-effect fee in kobo.
export function currentSideEffectFeeKobo(): string {
  return isNightRateNow() ? NIGHT_FEE_KOBO : DAY_FEE_KOBO;
}
