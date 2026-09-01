import { describe, it, expect, vi, afterEach, afterAll } from "vitest";

vi.mock("../email.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

const { emailQueue, processEmailJob, enqueueEmail } = await import("../email-queue.js");
const { startEmailWorker } = await import("../email-worker.js");
const { sendEmail } = await import("../email.js");

afterEach(async () => {
  vi.mocked(sendEmail).mockClear();
  // Queue state must not leak between tests — same Redis-backed queue instance is reused
  // across every test in this file (BullMQ Queue objects are meant to be long-lived, not
  // recreated per test).
  await emailQueue.drain();
  await emailQueue.clean(0, 0, "completed");
  await emailQueue.clean(0, 0, "failed");
});

describe("processEmailJob", () => {
  it("calls sendEmail with the job's to/subject/html", async () => {
    await processEmailJob({ to: "patient@example.com", subject: "Hi", html: "<p>hello</p>" });
    expect(sendEmail).toHaveBeenCalledWith("patient@example.com", "Hi", "<p>hello</p>");
  });

  it("propagates a sendEmail failure instead of swallowing it — BullMQ's retry only fires if the processor actually throws", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("Resend send failed: bad from address"));
    await expect(processEmailJob({ to: "x@example.com", subject: "S", html: "H" }))
      .rejects.toThrow("Resend send failed");
  });
});

describe("emailQueue configuration", () => {
  it("retries failed sends — more attempts than the virus-scan queue, since email failures are usually transient vendor/network issues with no other retry path", () => {
    expect(emailQueue.defaultJobOptions?.attempts).toBe(5);
    expect(emailQueue.defaultJobOptions?.backoff).toEqual({ type: "exponential", delay: 3000 });
  });
});

describe("enqueueEmail", () => {
  it("adds a real job to the queue with the expected name and data", async () => {
    await enqueueEmail("someone@example.com", "Subject line", "<p>body</p>");
    const waiting = await emailQueue.getJobs(["waiting", "active", "completed"]);
    const job = waiting.find((j) => j.data.to === "someone@example.com");
    expect(job).toBeDefined();
    expect(job!.name).toBe("send");
    expect(job!.data).toEqual({ to: "someone@example.com", subject: "Subject line", html: "<p>body</p>" });
  });
});

describe("email worker — end to end", () => {
  it("startEmailWorker() is idempotent (returns the same worker on repeated calls)", () => {
    const a = startEmailWorker();
    const b = startEmailWorker();
    expect(a).toBe(b);
  });

  it("an enqueued job is actually picked up and processed by the running worker", async () => {
    startEmailWorker();
    await enqueueEmail("e2e@example.com", "E2E Subject", "<p>e2e body</p>");

    await vi.waitFor(
      () => {
        expect(sendEmail).toHaveBeenCalledWith("e2e@example.com", "E2E Subject", "<p>e2e body</p>");
      },
      { timeout: 10_000, interval: 100 },
    );
  }, 15_000);

  it("a job that keeps failing is still retried, not dropped after one failure", async () => {
    startEmailWorker();
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("transient failure"));

    await enqueueEmail("retry@example.com", "Retry Subject", "<p>retry body</p>");

    // First attempt fails, backoff delay is 3s — waiting past that confirms a second call
    // actually happens rather than the job being abandoned after attempt 1.
    await vi.waitFor(
      () => {
        const calls = vi.mocked(sendEmail).mock.calls.filter(([to]) => to === "retry@example.com");
        expect(calls.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 10_000, interval: 200 },
    );
  }, 15_000);
});

afterAll(async () => {
  await emailQueue.obliterate({ force: true }).catch(() => {});
  await emailQueue.close();
});
