// Client-side preview only — the server (Africa/Lagos time, same logic) computes and charges
// the authoritative amount at submission time. This just avoids showing a stale/wrong estimate.
const DAY_FEE_KOBO = "300000";
const NIGHT_FEE_KOBO = "500000";

export function isNightRateNow(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", hour: "numeric", hour12: false }).format(new Date()),
  );
  const normalized = hour === 24 ? 0 : hour;
  return normalized >= 20 || normalized < 6;
}

export function currentSideEffectFeeKobo(): string {
  return isNightRateNow() ? NIGHT_FEE_KOBO : DAY_FEE_KOBO;
}
