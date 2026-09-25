import { enqueueEmail } from "../../../lib/email-queue.js";

// The staff dashboard origin the invite link points at; fails loudly in production rather than mailing a wrong-origin link.
function resolveStaffOrigin(): string {
  const origin = process.env.STAFF_DASHBOARD_ORIGIN;
  if (origin) return origin;
  if (process.env.NODE_ENV === "production") {
    throw new Error("STAFF_DASHBOARD_ORIGIN must be set in production to build staff invite links");
  }
  return "http://localhost:5174";
}

// Emails a newly provisioned staff member a link to set their own password (no password is ever chosen or seen by the admin).
export async function sendStaffInviteEmail(email: string, token: string, roleLabel: string): Promise<void> {
  const link = `${resolveStaffOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
  const html = `
    <h2>Your OncoFlow staff account is ready</h2>
    <p>An account was created for you as <strong>${roleLabel}</strong>.</p>
    <p><a href="${link}">Set your password</a></p>
    <p>This link expires in 72 hours. If you weren't expecting it, ignore this email.</p>
  `;
  await enqueueEmail(email, "OncoFlow Limited — Set up your staff account", html);
}
