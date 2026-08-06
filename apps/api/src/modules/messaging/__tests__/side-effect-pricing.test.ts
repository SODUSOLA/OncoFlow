import { describe, it, expect } from "vitest";
import { isNightRate, sideEffectReportFeeKobo, DAY_FEE_KOBO, NIGHT_FEE_KOBO } from "../entities/side-effect-pricing.js";

// Times below are UTC — Africa/Lagos is UTC+1 year-round (no DST), so e.g. 05:00 UTC = 06:00 Lagos.
describe("side-effect report pricing — Africa/Lagos time of day", () => {
  it("charges the day rate at 06:00 Lagos (the first day minute)", () => {
    const t = new Date("2026-06-15T05:00:00.000Z");
    expect(isNightRate(t)).toBe(false);
    expect(sideEffectReportFeeKobo(t)).toBe(DAY_FEE_KOBO);
  });

  it("charges the day rate at 19:59 Lagos (the last day minute)", () => {
    const t = new Date("2026-06-15T18:59:00.000Z");
    expect(isNightRate(t)).toBe(false);
    expect(sideEffectReportFeeKobo(t)).toBe(DAY_FEE_KOBO);
  });

  it("charges the night rate at 20:00 Lagos (the first night minute)", () => {
    const t = new Date("2026-06-15T19:00:00.000Z");
    expect(isNightRate(t)).toBe(true);
    expect(sideEffectReportFeeKobo(t)).toBe(NIGHT_FEE_KOBO);
  });

  it("charges the night rate at 23:30 Lagos", () => {
    const t = new Date("2026-06-15T22:30:00.000Z");
    expect(isNightRate(t)).toBe(true);
    expect(sideEffectReportFeeKobo(t)).toBe(NIGHT_FEE_KOBO);
  });

  it("charges the night rate at 02:00 Lagos (after midnight, still night)", () => {
    const t = new Date("2026-06-15T01:00:00.000Z");
    expect(isNightRate(t)).toBe(true);
    expect(sideEffectReportFeeKobo(t)).toBe(NIGHT_FEE_KOBO);
  });

  it("charges the day rate at 05:59 Lagos (the last night minute)", () => {
    const t = new Date("2026-06-15T04:59:00.000Z");
    expect(isNightRate(t)).toBe(true);
    expect(sideEffectReportFeeKobo(t)).toBe(NIGHT_FEE_KOBO);
  });

  it("day and night fees are distinct", () => {
    expect(DAY_FEE_KOBO).not.toBe(NIGHT_FEE_KOBO);
    expect(DAY_FEE_KOBO).toBe(300_000n);
    expect(NIGHT_FEE_KOBO).toBe(500_000n);
  });
});
