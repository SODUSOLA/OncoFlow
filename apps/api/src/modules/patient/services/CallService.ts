// Click-to-call: the RBAC gate and endpoint are real, but no telephony vendor is integrated, so it throws on purpose for now.
export async function placeCall(_patientId: string, _phone: string): Promise<{ callSessionId: string }> {
  const apiKey = process.env.CALL_PROVIDER_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Calling not configured — no telephony vendor integrated yet");
  }
  // No vendor SDK is wired up yet, so this always throws.
  throw new Error("Calling not configured — no telephony vendor integrated yet");
}
