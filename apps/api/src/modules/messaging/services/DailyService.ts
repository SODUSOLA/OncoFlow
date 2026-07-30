import crypto from "node:crypto";

const DAILY_API_BASE = "https://api.daily.co/v1";

export async function createDailyRoom(roomName: string): Promise<{ roomId: string }> {
  const apiKey = process.env.DAILY_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Daily.co API key not configured. Set DAILY_API_KEY");
  }
  const res = await fetch(`${DAILY_API_BASE}/rooms`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: roomName, properties: { enable_transcription: true } }),
  });
  if (!res.ok) {
    throw new Error(`Daily.co room creation failed: ${res.status}`);
  }
  const body = (await res.json()) as { name: string };
  return { roomId: body.name };
}

// Daily.co signs webhooks as HMAC-SHA256 over "{timestamp}.{rawBody}", base64-encoded
// (per Daily's webhook docs). Verify this exact scheme against a real Daily.co account
// before going live — this hasn't been tested against a real webhook delivery yet, only
// against self-computed signatures (no Daily.co credentials available in this environment).
export function verifyDailyWebhookSignature(rawBody: string, timestamp: string, signature: string): boolean {
  const secret = process.env.DAILY_WEBHOOK_SECRET ?? "";
  if (!secret) {
    throw new Error("Daily.co webhook secret not configured. Set DAILY_WEBHOOK_SECRET");
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("base64");
  // Constant-time comparison — a webhook signature check is exactly the kind of thing a
  // naive === would turn into a timing side-channel.
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
