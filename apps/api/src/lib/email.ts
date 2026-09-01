// Shared, not billing-scoped — future notification work (appointment confirmations, SLA
// breaches) may also want email. Same per-service, call-time credential pattern as Monnify
// (services/MonnifyService.ts) and R2 (documents/services/StorageService.ts): read env vars
// inside the function, not through config.ts, throw a clear "not configured" error if unset.
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM_EMAIL ?? "";
  if (!apiKey || !from) {
    throw new Error("Resend not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL");
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}
