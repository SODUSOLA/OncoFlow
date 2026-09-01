// Click-to-call: RBAC gate + endpoint are real (patient:call, granted only to Regional Admin
// and Onsite Nursing Officer — see seed/identity.ts), but no telephony vendor is integrated
// yet. Same "not configured" precedent as DailyService/MonnifyService when their credentials
// are missing — this always throws today, on purpose, until a real vendor is wired in.
export async function placeCall(_patientId: string, _phone: string): Promise<{ callSessionId: string }> {
  const apiKey = process.env.CALL_PROVIDER_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Calling not configured — no telephony vendor integrated yet");
  }
  // No vendor SDK wired up yet — reaching here would require CALL_PROVIDER_API_KEY to be set,
  // which nothing in this codebase does today.
  throw new Error("Calling not configured — no telephony vendor integrated yet");
}
