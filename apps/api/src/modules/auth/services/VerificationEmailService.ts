import { enqueueEmail } from "../../../lib/email-queue.js";

// Per-service, call-time env read (Resend/Monnify/R2 pattern) — but this one isn't a vendor
// credential, it's "where does the patient-facing web app live" so the fallback link in the
// email actually resolves. Same fail-loudly-in-production shape as config.ts's CORS_ORIGIN,
// since a silently wrong default here would mail out a broken link, not just error at boot.
function resolvePatientWebOrigin(): string {
  const origin = process.env.PATIENT_WEB_ORIGIN;
  if (origin) return origin;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PATIENT_WEB_ORIGIN must be set in production to build verification links");
  }
  return "http://localhost:5173";
}

// Request #4: a 6-digit code entered on the same page, not a link to a separate one — the code
// itself is the primary content. The link is kept as a harmless fallback (verify-email's route
// still accepts a code via ?token=, see auth/routes.ts) for a patient who'd rather tap than type.
export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  const link = `${resolvePatientWebOrigin()}/verify-email?token=${encodeURIComponent(code)}`;

  const html = `
    <h2>Confirm your email</h2>
    <p>Welcome to OncoFlow — enter this code to verify your email address:</p>
    <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; margin: 24px 0;">${code}</p>
    <p>This code expires in 10 minutes. If you didn't create an OncoFlow account, you can ignore this email.</p>
    <p style="color: #888; font-size: 13px;">Or open this link on the device you registered from: <a href="${link}">${link}</a></p>
  `;

  await enqueueEmail(email, "OncoFlow Limited — Your verification code", html);
}
