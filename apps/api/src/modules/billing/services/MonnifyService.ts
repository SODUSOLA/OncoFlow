import crypto from "node:crypto";

const MONNIFY_BASE = process.env.MONNIFY_BASE_URL ?? "https://sandbox.monnify.com";
const MONNIFY_API_KEY = process.env.MONNIFY_API_KEY ?? "";
const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY ?? "";
const CONTRACT_CODE = process.env.MONNIFY_CONTRACT_CODE ?? "";

// Fetches a Monnify access token using the API key and secret.
async function getAccessToken(): Promise<string> {
  const creds = Buffer.from(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`).toString("base64");
  const res = await fetch(`${MONNIFY_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/json" },
  });
  const body = (await res.json()) as { requestSuccessful: boolean; responseBody: { accessToken: string } };
  if (!body.requestSuccessful) throw new Error("Monnify auth failed");
  return body.responseBody.accessToken;
}

// Creates a Monnify reserved bank account for a patient's wallet funding.
export async function createReservedAccount(patientId: string, email: string, name: string) {
  const token = await getAccessToken();
  const ref = `RA-${patientId}-${Date.now()}`;
  const res = await fetch(`${MONNIFY_BASE}/api/v2/bank-transfer/reserved-accounts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      accountReference: ref,
      accountName: name,
      currencyCode: "NGN",
      contractCode: CONTRACT_CODE,
      customerEmail: email,
      customerName: name,
      getAllAvailableBanks: true,
    }),
  });
  const body = (await res.json()) as { requestSuccessful: boolean; responseMessage?: string; responseBody: unknown };
  if (!body.requestSuccessful) throw new Error(`Monnify reserved account creation failed: ${body.responseMessage ?? "unknown"}`);
  return body.responseBody;
}

// Verifies a Monnify webhook's HMAC-SHA512 signature.
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const hash = crypto.createHmac("sha512", MONNIFY_SECRET_KEY).update(payload).digest("hex");
  return hash === signature;
}
