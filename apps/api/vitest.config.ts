import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["./src/test/global-setup.ts"],
    setupFiles: ["./src/test/setup.ts"],
    // Integration-scale timeout: real HTTP, Postgres and bcrypt under full parallelism exceed vitest's 5s default, so a busy machine isn't reported as broken tests.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: "postgresql://oncoflow:oncoflow_dev@localhost:5432/oncoflow",
      REDIS_URL: "redis://localhost:6379",
      // Dummy R2 credentials so StorageService's not-configured guard doesn't defeat the S3Client mock; no real R2 call is made.
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
