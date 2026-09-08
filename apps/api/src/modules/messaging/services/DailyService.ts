import crypto from "node:crypto";

const DAILY_API_BASE = "https://api.daily.co/v1";

export interface CreateDailyRoomOptions {
  // Unix seconds — Daily auto-invalidates the room at this timestamp on its own side.
  // ONCOFLOW_SCHEDULING_AND_VIDEO_LIFECYCLE.md §3: "reuse Daily's own room expiration, don't
  // build a custom expiry-check layer." Omitted entirely for legacy lazy-provisioned rooms
  // (Consultant Phase 4/5's old "Join Call" path, still reachable for non-scheduling-flow
  // appointments), which never had a scheduled end time to compute this from.
  exp?: number;
}

export async function createDailyRoom(roomName: string, opts: CreateDailyRoomOptions = {}): Promise<{ roomId: string }> {
  const apiKey = process.env.DAILY_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("Daily.co API key not configured. Set DAILY_API_KEY");
  }
  const properties: Record<string, unknown> = { enable_transcription: true };
  if (opts.exp) properties.exp = opts.exp;
  // Cloud recording is opt-in, not the room-creation default — enabling it is a real
  // data-handling/consent decision this project hasn't made yet (see .env.example note). When
  // it's on, this is Daily's OWN cloud storage, not a bring-your-own-bucket configuration: that
  // needs an AWS IAM role Daily can assume, which this project's object storage (Cloudflare R2,
  // access-key based, no IAM roles) can't provide — recordings land in Daily's storage and are
  // tracked via the recording webhook, not mirrored into R2.
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

// A Daily room's joinable URL is https://<team-domain>.daily.co/<room-name> — the team domain
// isn't returned by the room-creation response and isn't derivable from anything else this app
// stores, so it needs its own env var. Only DAILY_API_KEY/DAILY_WEBHOOK_SECRET existed before
// this (see .env.example) — daily-js's Call Object join (Phase 5) is the first thing that
// actually needs a real, joinable URL rather than just a room name.
export function getDailyRoomUrl(roomName: string): string {
  const domain = process.env.DAILY_DOMAIN ?? "";
  if (!domain) {
    throw new Error("Daily.co domain not configured. Set DAILY_DOMAIN");
  }
  return `https://${domain}.daily.co/${roomName}`;
}

// Phase 4's Pre-call Briefing acceptance criteria requires actually detecting when the patient's
// client joins the room — not a webhook subscription (those are configured account-wide against
// specific event types, not something this dev environment can register), but a direct poll of
// Daily's own REST presence endpoint, which reports who's connected to a room right now.
export interface DailyPresenceParticipant {
  userId: string | null;
  userName: string | null;
  joinTime: string;
}

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

// Decision 2 (ONCOFLOW_CONSULTANT_BUILD_GUIDE.md ADR) — role-scoped meeting tokens: the
// clinician gets an owner token (can start transcription, has recording rights per Daily's
// owner-privilege model), the patient gets a plain participant token. Both are single-room,
// non-admin API tokens — this does not grant dashboard access to the underlying Daily account.
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
