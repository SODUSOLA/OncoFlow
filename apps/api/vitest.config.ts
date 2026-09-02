import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // These are integration tests — real HTTP through supertest, real Postgres, real bcrypt —
    // not unit tests, so vitest's 5s default is the wrong scale. Individually they finish in
    // 0.4-1.5s, but the suite runs one worker per core and bcrypt saturates the CPU, so under
    // full parallelism the slower ones crossed 5s and failed as timeouts. That produced a
    // failure count that moved with machine load (19, 25, 32, 40 across consecutive runs)
    // rather than with the code. Raising the ceiling changes no assertion; it stops a busy
    // machine from being reported as a broken test suite.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: "postgresql://oncoflow:oncoflow_dev@localhost:5432/oncoflow",
      REDIS_URL: "redis://localhost:6379",
      // documents.test.ts mocks @aws-sdk/client-s3's S3Client — but StorageService.ts's own
      // "no credentials configured" guard runs BEFORE ever constructing S3Client, so it still
      // throws without these, defeating the mock entirely. Dummy values only; no real R2 call
      // is ever made in tests (the mock intercepts .send()).
      R2_ACCOUNT_ID: "test-account",
      R2_ACCESS_KEY_ID: "test-access-key",
      R2_SECRET_ACCESS_KEY: "test-secret-key",
    },
    coverage: {
      provider: "v8",
      include: ["src/modules/**"],
    },
  },
});
