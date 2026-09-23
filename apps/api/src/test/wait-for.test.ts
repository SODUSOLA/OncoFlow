import { describe, it, expect } from "vitest";
import { waitFor } from "./wait-for.js";

// waitFor underpins several fire-and-forget assertions, so its contract is pinned to prevent those suites passing vacuously.
describe("waitFor", () => {
  it("returns the value as soon as a sync check succeeds", async () => {
    expect(await waitFor(() => "ready")).toBe("ready");
  });

  it("returns undefined when a sync condition never holds", async () => {
    expect(await waitFor(() => undefined, { timeoutMs: 60, intervalMs: 10 })).toBeUndefined();
  });

  // Guards against an un-awaited async check returning an always-truthy Promise, so the first poll would succeed and assert against nothing.
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
