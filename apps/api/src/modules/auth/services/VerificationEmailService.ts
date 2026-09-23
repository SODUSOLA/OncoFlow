import { enqueueEmail } from "../../../lib/email-queue.js";

// Resolves where the patient web app lives at call time, failing loudly in production so emails don't carry a broken link.
function resolvePatientWebOrigin(): string {
  const origin = process.env.PATIENT_WEB_ORIGIN;
  if (origin) return origin;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PATIENT_WEB_ORIGIN must be set in production to build verification links");
  }
  return "http://localhost:5173";
}

// Emails the 6-digit code as the primary content, with a link kept as a fallback for people who'd rather tap than type.
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
