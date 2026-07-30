import { z } from "zod";

// Boot-critical, structural settings only — parsed once here so a broken/missing value fails
// loudly at startup instead of surfacing later as a confusing runtime error. Optional
// third-party credentials (R2, Monnify, Daily.co) are deliberately NOT here: those are read
// per-service, at call time, so each one can fail clearly only when actually invoked without
// credentials, and so tests can toggle them dynamically without a frozen-at-import value.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  CORS_ORIGIN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration — see errors above");
}

const env = parsed.data;

// Wildcard + credentials is both rejected by browsers and a real access-control gap — fail
// loudly in production instead of silently falling back to it (sprint2-hardening-checklist.md).
function resolveCorsOrigins(): string[] {
  if (env.CORS_ORIGIN) {
    return env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
  }
  if (env.NODE_ENV === "production") {
    throw new Error("CORS_ORIGIN must be set (comma-separated allowlist) in production");
  }
  return ["http://localhost:5173"];
}

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  corsOrigins: resolveCorsOrigins(),
};
