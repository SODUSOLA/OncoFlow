import webpush from "web-push";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { getRedis } from "../../lib/redis.js";
import { enqueueEmail } from "../../lib/email-queue.js";
import { PushSubscriptionRepository } from "./repository.js";
import { templateFor } from "./templates.js";

const subs = new PushSubscriptionRepository();

// At most one fallback email per user in this window, so a busy chat can't flood an inbox.
const EMAIL_THROTTLE_SECONDS = 15 * 60;

export interface PushPayload { title: string; body: string; url: string; tag: string }
type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

// Overridable so tests can observe sends without a real push service.
let sender: Sender | null = null;
export function setPushSender(fn: Sender | null): void { sender = fn; }

// VAPID credentials are read at call time (like the other third-party keys), so push is simply off when unset.
export function vapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function defaultSender(): Sender {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@oncoflow.dev", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 60 * 60 });
}

// Pushes to every device the user registered. A 404/410 from the push service means the device is gone, so it's pruned.
export async function pushToUser(userId: string, type: string): Promise<number> {
  if (!sender && !vapidConfigured()) return 0;
  const devices = await subs.findByUser(userId);
  if (devices.length === 0) return 0;
  const t = templateFor(type);
  // tag makes repeated alerts of one kind replace each other on the device instead of stacking.
  const payload = JSON.stringify({ title: t.title, body: t.body, url: t.path, tag: type } satisfies PushPayload);
  const send = sender ?? defaultSender();
  let delivered = 0;
  await Promise.all(devices.map(async (d) => {
    try {
      await send({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload);
      delivered++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await subs.deleteByEndpoint(d.endpoint);
    }
  }));
  return delivered;
}

// True when the user holds a live session anywhere, i.e. isn't "signed out".
async function hasActiveSession(userId: string): Promise<boolean> {
  const rows = await db.execute<{ live: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM session WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > now()) AS live`);
  return Boolean(rows[0]?.live);
}

// A user with no live session (signed out, or expired) gets a generic email too, throttled. Skipped when email
// isn't configured, so a dev machine without Resend doesn't queue jobs that can only fail.
export async function emailIfSignedOut(userId: string, type: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  if (await hasActiveSession(userId)) return false;
  const claimed = await getRedis().set(`notif-email:${userId}`, "1", "EX", EMAIL_THROTTLE_SECONDS, "NX");
  if (claimed !== "OK") return false;
  const rows = await db.execute<{ email: string }>(sql`SELECT email FROM "user" WHERE id = ${userId} AND is_deleted = false LIMIT 1`);
  const to = rows[0]?.email;
  if (!to) return false;
  const t = templateFor(type);
  await enqueueEmail(to, `OncoFlow: ${t.title}`, `<p>${t.body}</p><p>Sign in to OncoFlow to see the details.</p>`);
  return true;
}

// Business logic for device registration.
export class PushService {
  async subscribe(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null) {
    await subs.upsert({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 255) ?? null });
  }
  async unsubscribe(userId: string, endpoint: string) {
    return subs.deleteForUser(userId, endpoint);
  }
}
export const pushService = new PushService();
