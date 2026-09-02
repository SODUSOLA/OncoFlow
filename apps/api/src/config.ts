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
  // Whether holding a staff role (anything but PATIENT) makes MFA mandatory — see
  // lib/mfa-policy.ts. Deliberately a string enum rather than z.coerce.boolean(): coercion
  // runs Boolean("false"), which is true, so MFA_ENFORCE_STAFF=false would silently enable it.
  //
  // Defaults OFF, and that default is a known gap rather than a recommendation: apps/dashboard
  // has no MFA enrolment screen yet, so turning this on now lets staff log in but leaves them
  // blocked on every gated route with no in-product way to enrol. Ship that screen against
  // POST /auth/mfa/enroll, then set MFA_ENFORCE_STAFF=true — it should be on before go-live.
  MFA_ENFORCE_STAFF: z.enum(["true", "false"]).default("false"),
  // Largest file accepted by POST /files/upload, in bytes (default 10MB). Lab PDFs, phone
  // photos of physical documents and voice notes all have to fit under this.
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
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
  mfaEnforceStaff: env.MFA_ENFORCE_STAFF === "true",
  maxUploadBytes: env.MAX_UPLOAD_BYTES,
  // Uploads arrive as base64 inside a JSON body, which inflates the bytes by 4/3, so the JSON
  // body limit for the upload route has to be meaningfully larger than the file limit itself
  // or the parser rejects a file that is actually within budget. The 1KB allowance covers the
  // surrounding JSON (field names, mimeType, patientId).
  maxUploadBodyBytes: Math.ceil(env.MAX_UPLOAD_BYTES * 4 / 3) + 1024,
};
