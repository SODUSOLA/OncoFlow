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
    },
    coverage: {
      provider: "v8",
      include: ["src/modules/**"],
    },
  },
});
