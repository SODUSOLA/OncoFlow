// Polls for a fire-and-forget side effect instead of sleeping a fixed time, awaiting async checks so a Promise isn't mistaken for a truthy result.
type Falsy = undefined | null | false;

// Polls `check` until it returns a truthy value or the timeout elapses, then returns that value.
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
