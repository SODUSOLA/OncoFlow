import { enqueueEmail } from "../../../lib/email-queue.js";

// Resolves the patient web origin per call, failing loudly in production rather than mailing a link to the wrong origin.
function resolvePatientWebOrigin(): string {
  const origin = process.env.PATIENT_WEB_ORIGIN;
  if (origin) return origin;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PATIENT_WEB_ORIGIN must be set in production to build password reset links");
  }
  return "http://localhost:5173";
}

// Emails the password reset link to the user.
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const link = `${resolvePatientWebOrigin()}/reset-password?token=${encodeURIComponent(token)}`;

  const html = `
    <h2>Reset your password</h2>
    <p>We received a request to reset the password on your OncoFlow account.</p>
    <p><a href="${link}">Choose a new password</a></p>
    <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>
  `;

  await enqueueEmail(email, "OncoFlow Limited — Reset your password", html);
}
