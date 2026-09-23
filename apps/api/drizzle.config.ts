import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Points at the compiled dist/ schema because drizzle-kit's TS loader can't resolve NodeNext ".js" import specifiers.
  schema: "./dist/db/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://oncoflow:oncoflow_dev@localhost:6432/oncoflow",
  },
});