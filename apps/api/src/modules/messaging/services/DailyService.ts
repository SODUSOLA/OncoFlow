import crypto from "node:crypto";

const DAILY_API_BASE = "https://api.daily.co/v1";

export interface CreateDailyRoomOptions {
  // Unix-seconds expiry using Daily's own room expiration; omitted for legacy rooms with no scheduled end.
  exp?: number;
}

// Creates a Daily room and returns its id.
export async function createDailyRoom(roomName: string, opts: CreateDailyRoomOptions = {}): Promise<{ roomId: string }> {
  const apiKey = process.env.DAILY_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Daily.co API key not configured. Set DAILY_API_KEY");
  }
  const properties: Record<string, unknown> = { enable_transcription: true };
  if (opts.exp) properties.exp = opts.exp;
  // Cloud recording is opt-in because enabling it is a data-handling decision; it uses Daily's own storage since R2 can't provide the IAM role BYO-bucket needs.
  if (process.env.DAILY_ENABLE_RECORDING === "true") properties.enable_recording = "cloud";

  const res = await fetch(`${DAILY_API_BASE}/rooms`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: roomName, properties }),
  });
  if (!res.ok) {
    throw new Error(`Daily.co room creation failed: ${res.status}`);
  }
  const body = (await res.json()) as { name: string };
  return { roomId: body.name };
}

// Builds the joinable room URL, which needs its own DAILY_DOMAIN env var since the team domain isn't returned by the API.
export function getDailyRoomUrl(roomName: string): string {
  const domain = process.env.DAILY_DOMAIN ?? "";
  if (!domain) {
    throw new Error("Daily.co domain not configured. Set DAILY_DOMAIN");
  }
  return `https://${domain}.daily.co/${roomName}`;
}

// Presence is polled from Daily's REST endpoint, since webhook subscriptions can't be registered in this environment.
export interface DailyPresenceParticipant {
  userId: string | null;
  userName: string | null;
  joinTime: string;
}

// Returns who is currently connected to a Daily room.
export async function getDailyRoomPresence(roomName: string): Promise<{ count: number; participants: DailyPresenceParticipant[] }> {
  const apiKey = process.env.DAILY_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Daily.co API key not configured. Set DAILY_API_KEY");
  }
  const res = await fetch(`${DAILY_API_BASE}/rooms/${encodeURIComponent(roomName)}/presence`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Daily.co presence lookup failed: ${res.status}`);
  }
  const body = (await res.json()) as { total_count: number; data: { userId: string | null; userName: string | null; joinTime: string }[] };
  return {
    count: body.total_count,
    participants: body.data.map((p) => ({ userId: p.userId, userName: p.userName, joinTime: p.joinTime })),
  };
}

// Role-scoped tokens: the clinician gets an owner token and the patient a plain participant one, both single-room and non-admin.
export async function createDailyMeetingToken(roomName: string, opts: { isOwner: boolean; userName: string }): Promise<string> {
  const apiKey = process.env.DAILY_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Daily.co API key not configured. Set DAILY_API_KEY");
  }
  const res = await fetch(`${DAILY_API_BASE}/meeting-tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { room_name: roomName, is_owner: opts.isOwner, user_name: opts.userName } }),
  });
  if (!res.ok) {
    throw new Error(`Daily.co token creation failed: ${res.status}`);
  }
  const body = (await res.json()) as { token: string };
  return body.token;
}

// Verifies Daily's HMAC-SHA256 over "{timestamp}.{rawBody}"; only tested against self-computed signatures, so confirm against a real delivery.
export function verifyDailyWebhookSignature(rawBody: string, timestamp: string, signature: string): boolean {
  const secret = process.env.DAILY_WEBHOOK_SECRET ?? "";
  if (!secret) {
    throw new Error("Daily.co webhook secret not configured. Set DAILY_WEBHOOK_SECRET");
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("base64");
  // Constant-time comparison so the signature check isn't a timing side-channel.
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
