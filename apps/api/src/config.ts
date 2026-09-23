import { z } from "zod";

// Boot-critical settings only, parsed once so a bad value fails at startup; optional third-party credentials are read per-service at call time.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  CORS_ORIGIN: z.string().optional(),
  // Makes MFA mandatory for staff roles; a string enum because z.coerce.boolean() would turn "false" into true, and it defaults off until the dashboard has an MFA enrolment screen.
  MFA_ENFORCE_STAFF: z.enum(["true", "false"]).default("false"),
  // Largest file (bytes) accepted by POST /files/upload, default 10MB.
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration — see errors above");
}

const env = parsed.data;

// Rejects wildcard CORS origins with credentials in production instead of silently falling back to them.
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
  // Upload JSON body limit: file limit inflated by 4/3 for base64 plus 1KB for the surrounding JSON fields.
  maxUploadBodyBytes: Math.ceil(env.MAX_UPLOAD_BYTES * 4 / 3) + 1024,
};
