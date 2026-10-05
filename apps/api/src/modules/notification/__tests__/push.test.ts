import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";

vi.mock("../../../lib/email-queue.js", () => ({ enqueueEmail: vi.fn(async () => {}) }));

import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { getRedis } from "../../../lib/redis.js";
import { enqueueEmail } from "../../../lib/email-queue.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { patient } from "../../patient/schema.js";
import { facility } from "../../facility/schema.js";
import { conversation } from "../../messaging/schema.js";
import { notification, pushSubscription } from "../schema.js";
import { NotificationService } from "../service.js";
import { setPushSender } from "../pushService.js";
import { templateFor } from "../templates.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();
const service = new NotificationService();
const endpointA = `https://push.example.test/${crypto.randomUUID()}`;
const endpointB = `https://push.example.test/${crypto.randomUUID()}`;
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "BPubKey" + crypto.randomUUID(), auth: "authSecret" } });

async function makeUser(roleName?: string, withSession = true) {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, email: `push-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  if (roleName) {
    const r = await db.select().from(role).where(eq(role.name, roleName as never)).limit(1);
    await db.insert(userRole).values({ userId: id, roleId: r[0]!.id });
  }
  const sessionId = crypto.randomUUID();
  if (withSession) {
    await db.insert(session).values({ id: sessionId, userId: id, device: "t", ip: "127.0.0.1", expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true });
  }
  return { id, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

const created: string[] = [];
beforeAll(async () => { await seedIdentity(); });
afterEach(() => { setPushSender(null); vi.mocked(enqueueEmail).mockClear(); delete process.env.RESEND_API_KEY; });
afterAll(async () => {
  for (const e of [endpointA, endpointB]) await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, e));
  for (const id of created) await getRedis().del(`notif-email:${id}`);
});

describe("push registration", () => {
  it("requires sign-in", async () => {
    // The test harness authenticates cookie-less requests as TEST_USER_ID, so it's unset to see the real behaviour.
    const saved = process.env.TEST_USER_ID;
    delete process.env.TEST_USER_ID;
    try {
      expect((await request(app).post("/push/subscriptions").send(sub(endpointA))).status).toBe(401);
      expect((await request(app).get("/push/public-key")).status).toBe(401);
      expect((await request(app).delete("/push/subscriptions").send({ endpoint: endpointA })).status).toBe(401);
    } finally {
      if (saved !== undefined) process.env.TEST_USER_ID = saved;
    }
  });

  it("registers a device for the caller, moves it if another user takes over the same browser, and removes only your own", async () => {
    const a = await makeUser(); const b = await makeUser();
    expect((await request(app).post("/push/subscriptions").set("Cookie", a.cookie).send(sub(endpointA))).status).toBe(201);
    expect((await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, endpointA)))[0]!.userId).toBe(a.id);

    // Another user signing in on the same browser takes the registration; it is not duplicated.
    expect((await request(app).post("/push/subscriptions").set("Cookie", b.cookie).send(sub(endpointA))).status).toBe(201);
    const rows = await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, endpointA));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(b.id);

    // a can't remove b's device.
    const denied = await request(app).delete("/push/subscriptions").set("Cookie", a.cookie).send({ endpoint: endpointA });
    expect(denied.body.removed).toBe(false);
    expect(await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, endpointA))).toHaveLength(1);
    const ok = await request(app).delete("/push/subscriptions").set("Cookie", b.cookie).send({ endpoint: endpointA });
    expect(ok.body.removed).toBe(true);
  });

  it("rejects malformed subscriptions", async () => {
    const a = await makeUser();
    expect((await request(app).post("/push/subscriptions").set("Cookie", a.cookie).send({ endpoint: "not a url", keys: {} })).status).toBe(400);
  });
});

describe("push delivery", () => {
  it("sends a generic payload to every registered device, even though the user has no live session", async () => {
    const u = await makeUser(undefined, false);
    const s1 = sub(endpointA), s2 = sub(endpointB);
    await db.insert(pushSubscription).values([{ userId: u.id, endpoint: s1.endpoint, p256dh: s1.keys.p256dh, auth: s1.keys.auth }, { userId: u.id, endpoint: s2.endpoint, p256dh: s2.keys.p256dh, auth: s2.keys.auth }]);
    const sent: { endpoint: string; payload: string }[] = [];
    setPushSender(async (s, payload) => { sent.push({ endpoint: s.endpoint, payload }); });

    await service.create({ recipientId: u.id, type: "SPECIALIST_ESCALATION" });
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    const body = JSON.parse(sent[0]!.payload);
    expect(body).toEqual({ title: "New escalation", body: "A patient escalation needs attention.", url: "/", tag: "SPECIALIST_ESCALATION" });
    // Nothing identifying a patient can be in a payload: only template text and an app path.
    expect(Object.keys(body).sort()).toEqual(["body", "tag", "title", "url"]);
    await db.delete(pushSubscription).where(eq(pushSubscription.userId, u.id));
  });

  it("prunes a device the push service says is gone, and keeps the rest", async () => {
    const u = await makeUser();
    const dead = sub(endpointA), live = sub(endpointB);
    await db.insert(pushSubscription).values([{ userId: u.id, endpoint: dead.endpoint, p256dh: dead.keys.p256dh, auth: dead.keys.auth }, { userId: u.id, endpoint: live.endpoint, p256dh: live.keys.p256dh, auth: live.keys.auth }]);
    setPushSender(async (s) => { if (s.endpoint === endpointA) throw Object.assign(new Error("gone"), { statusCode: 410 }); });
    await service.create({ recipientId: u.id, type: "NEW_MESSAGE" });
    await vi.waitFor(async () => {
      const left = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, u.id));
      expect(left.map((r) => r.endpoint)).toEqual([endpointB]);
    });
    await db.delete(pushSubscription).where(eq(pushSubscription.userId, u.id));
  });

  it("never sends to users with no registered device", async () => {
    const u = await makeUser();
    const send = vi.fn(async () => {});
    setPushSender(send);
    await service.create({ recipientId: u.id, type: "NEW_MESSAGE" });
    await new Promise((r) => setTimeout(r, 300));
    expect(send).not.toHaveBeenCalled();
  });

  it("has a generic template for every notification type, with no placeholders for patient data", () => {
    for (const type of ["NEW_MESSAGE", "SLA_BREACH", "SPECIALIST_ESCALATION", "NURSING_CASE_SUBMITTED", "NURSING_CASE_REVIEWED", "IDENTITY_MISMATCH_REPORTED", "APPOINTMENT_REMINDER"]) {
      const t = templateFor(type);
      expect(t.title.length).toBeGreaterThan(0);
      expect(`${t.title} ${t.body}`).not.toMatch(/\{|\$|patient name/i);
    }
    expect(templateFor("SOMETHING_NEW").title).toBe("OncoFlow");
  });
});

describe("email for signed-out users", () => {
  it("emails a user with no live session once, throttling the next alert; never a signed-in user", async () => {
    process.env.RESEND_API_KEY = "test-key";
    const out = await makeUser(undefined, false);
    const inn = await makeUser();
    created.push(out.id, inn.id);
    await service.create({ recipientId: out.id, type: "NEW_MESSAGE" });
    await service.create({ recipientId: out.id, type: "NEW_MESSAGE" });
    await service.create({ recipientId: inn.id, type: "NEW_MESSAGE" });
    await vi.waitFor(() => expect(enqueueEmail).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 300));
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = vi.mocked(enqueueEmail).mock.calls[0]!;
    expect(to).toMatch(/^push-.*@test\.com$/);
    expect(subject).toBe("OncoFlow: New message");
    expect(html).not.toMatch(/patient/i);
  });

  it("skips email entirely when email isn't configured", async () => {
    const out = await makeUser(undefined, false);
    created.push(out.id);
    await service.create({ recipientId: out.id, type: "NEW_MESSAGE" });
    await new Promise((r) => setTimeout(r, 300));
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});

describe("new-message alerts", () => {
  it("alert the other people on a thread, never the sender", async () => {
    const fac = (await db.insert(facility).values({ id: crypto.randomUUID(), name: "Push Test", region: "Push-Region", address: "x", status: "ACTIVE" }).returning())[0]!;
    const patientUser = await makeUser("PATIENT");
    const vmo = await makeUser("VIRTUAL_MEDICAL_OFFICER");
    const patientId = crypto.randomUUID();
    await db.insert(patient).values({ id: patientId, userId: patientUser.id, uniquePatientId: "PU-" + crypto.randomUUID().slice(0, 8).toUpperCase(), firstName: "Push", lastName: "Patient", dob: "1980-01-01", gender: "Female", phone: "+2348012349999", email: `pp.${crypto.randomUUID().slice(0, 6)}@example.com`, facilityId: fac.id, status: "ACTIVE" });
    const convoId = crypto.randomUUID();
    await db.insert(conversation).values({ id: convoId, patientId, conversationType: "MO_SIDE_EFFECT", status: "OPEN", assignedTo: vmo.id });

    const res = await request(app).post(`/conversations/${convoId}/messages`).set("Cookie", vmo.cookie).send({ type: "TEXT", content: "How are you feeling?" });
    expect(res.status).toBe(201);
    const forPatient = await db.select().from(notification).where(and(eq(notification.recipientId, patientUser.id), eq(notification.type, "NEW_MESSAGE")));
    const forSender = await db.select().from(notification).where(and(eq(notification.recipientId, vmo.id), eq(notification.type, "NEW_MESSAGE")));
    expect(forPatient).toHaveLength(1);
    expect(forSender).toHaveLength(0);
  });
});
