// Waits for a side effect that nothing in the request path awaits.
//
// Several services send email or write notifications fire-and-forget (register does not await
// issueAndSendVerificationEmail; payInvoiceWithWallet does not await notifyPaidBestEffort), so
// tests asserting on those effects have to wait for them. They originally waited a fixed 50ms,
// which is a race, not a wait: this suite runs one worker per core and saturates the CPU, so on
// a loaded machine the effect had not landed yet and the assertion failed with a confusing
// "expected 0 to be greater than 0". Failures then tracked machine load rather than the code.
//
// Polling costs nothing when the effect is already there (first check succeeds immediately) and
// only spends time when it genuinely has to wait.
// `check` may be sync or async, and its result is awaited before being tested for truthiness.
// Awaiting matters: an un-awaited async check returns a Promise, which is always truthy, so the
// first poll would "succeed" immediately and the caller would assert against nothing.
type Falsy = undefined | null | false;

export async function waitFor<T>(
  check: () => T | Falsy | Promise<T | Falsy>,
  { timeoutMs = 2000, intervalMs = 20 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
