import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Points at compiled output, not source: drizzle-kit's own TS loader can't resolve the
  // explicit ".js" import specifiers our NodeNext setup requires (it looks for a literal
  // enums.js next to enums.ts and doesn't find one) — but Node's real runtime resolves them
  // fine, so drizzle-kit reading the already-compiled dist/ output sidesteps the problem
  // entirely. The db:generate/db:push/db:studio scripts run `tsc` first for exactly this.
  schema: "./dist/db/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://oncoflow:oncoflow_dev@localhost:6432/oncoflow",
  },
});