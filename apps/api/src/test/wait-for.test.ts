import { describe, it, expect } from "vitest";
import { waitFor } from "./wait-for.js";

// waitFor underpins the fire-and-forget assertions in email-verification, password-reset,
// auto-registration and payment. If it ever returned a truthy value for a condition that never
// held, all four suites would pass vacuously — so its contract is pinned here directly.
describe("waitFor", () => {
  it("returns the value as soon as a sync check succeeds", async () => {
    expect(await waitFor(() => "ready")).toBe("ready");
  });

  it("returns undefined when a sync condition never holds", async () => {
    expect(await waitFor(() => undefined, { timeoutMs: 60, intervalMs: 10 })).toBeUndefined();
  });

  // The bug this guards: an un-awaited async check returns a Promise, which is always truthy,
  // so the first poll would "succeed" immediately and the caller would assert against nothing.
  it("awaits an async check rather than treating its Promise as truthy", async () => {
    const result = await waitFor(
      () => Promise.resolve(undefined),
      { timeoutMs: 60, intervalMs: 10 },
    );
    expect(result).toBeUndefined();
  });

  it("resolves once an async condition eventually becomes true", async () => {
    let attempts = 0;
    const result = await waitFor(() => Promise.resolve(++attempts >= 3 ? "landed" : undefined), {
      timeoutMs: 2000, intervalMs: 5,
    });
    expect(result).toBe("landed");
    expect(attempts).toBeGreaterThanOrEqual(3);
  });

  it("keeps waiting for a value that arrives after the first poll", async () => {
    let value: string | undefined;
    setTimeout(() => { value = "late"; }, 40);
    expect(await waitFor(() => value, { timeoutMs: 2000, intervalMs: 5 })).toBe("late");
  });
});
