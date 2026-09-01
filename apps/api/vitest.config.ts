import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
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
