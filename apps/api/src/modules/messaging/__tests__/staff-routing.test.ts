import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient } from "../../patient/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { conversation, message } from "../schema.js";
import { file } from "../../documents/schema.js";
import { notification } from "../../notification/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();

interface Actor { id: string; cookie: string }
let adminHere: Actor;
let adminElsewhere: Actor;
let patientActor: Actor;
let vmoA: Actor;
let vmoB: Actor;
let patientId: string;
let facilityHere: string;

async function makeActor(roleName: string | null, facilityId: string | null): Promise<Actor> {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, email: `routing-${crypto.randomUUID()}@test.com`, passwordHash: "test", facilityId });
  if (roleName) {
    const [r] = await db.select().from(role).where(eq(role.name, roleName as never)).limit(1);
    await db.insert(userRole).values({ userId: id, roleId: r!.id });
  }
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({ id: sessionId, userId: id, device: "t", ip: "127.0.0.1", expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true });
  return { id, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

beforeAll(async () => {
  await seedIdentity();
  const region = `RoutingRegion-${crypto.randomUUID().slice(0, 6)}`;
  const [fHere] = await db.insert(facility).values({ id: crypto.randomUUID(), name: "Routing Here", region, address: "R St", status: "ACTIVE" }).returning();
  const [fElse] = await db.insert(facility).values({ id: crypto.randomUUID(), name: "Routing Elsewhere", region: `${region}-other`, address: "R St", status: "ACTIVE" }).returning();
  facilityHere = fHere!.id;
  adminHere = await makeActor("REGIONAL_ADMIN", fHere!.id);
  adminElsewhere = await makeActor("REGIONAL_ADMIN", fElse!.id);
  patientActor = await makeActor(null, null);
  vmoA = await makeActor("VIRTUAL_MEDICAL_OFFICER", null);
  vmoB = await makeActor("VIRTUAL_MEDICAL_OFFICER", null);
  const [p] = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "ROUTE-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Route", lastName: "Patient", dob: "1990-01-01", gender: "Female", phone: "+2348000000123",
    email: `route.${crypto.randomUUID().slice(0, 6)}@test.com`, facilityId: fHere!.id, status: "ACTIVE", userId: patientActor.id,
  }).returning();
  patientId = p!.id;
});

describe("patient admin inquiries reach the Regional Admin", () => {
  let conversationId: string;

  it("notifies only the patient's region's Regional Admins when the patient writes", async () => {
    const start = await request(app).post("/conversations").set("Cookie", patientActor.cookie).send({ patientId, conversationType: "ADMIN_INQUIRY" });
    expect(start.status).toBe(201);
    conversationId = start.body.conversation.id;

    const sent = await request(app).post(`/conversations/${conversationId}/messages`).set("Cookie", patientActor.cookie).send({ type: "TEXT", content: "I need help using the system" });
    expect(sent.status).toBe(201);

    const here = await db.select().from(notification).where(and(eq(notification.recipientId, adminHere.id), eq(notification.type, "PATIENT_INQUIRY")));
    expect(here).toHaveLength(1);
    const elsewhere = await db.select().from(notification).where(and(eq(notification.recipientId, adminElsewhere.id), eq(notification.type, "PATIENT_INQUIRY")));
    expect(elsewhere).toHaveLength(0);
  });

  it("lists the inquiry for the admin in that region, with the last message", async () => {
    const res = await request(app).get("/admin/patient-inquiries").set("Cookie", adminHere.cookie);
    expect(res.status).toBe(200);
    const found = res.body.inquiries.find((i: { id: string }) => i.id === conversationId);
    expect(found).toBeDefined();
    expect(found.patient.uniquePatientId).toMatch(/^ROUTE-/);
    expect(found.lastMessage.content).toBe("I need help using the system");
    expect(found.lastMessage.fromPatient).toBe(true);
  });

  it("hides it from an admin in another region", async () => {
    const list = await request(app).get("/admin/patient-inquiries").set("Cookie", adminElsewhere.cookie);
    expect(list.body.inquiries.some((i: { id: string }) => i.id === conversationId)).toBe(false);
    const thread = await request(app).get(`/admin/patient-inquiries/${conversationId}/messages`).set("Cookie", adminElsewhere.cookie);
    expect(thread.status).toBe(404);
    const reply = await request(app).post(`/admin/patient-inquiries/${conversationId}/messages`).set("Cookie", adminElsewhere.cookie).send({ content: "hi" });
    expect(reply.status).toBe(404);
  });

  it("lets the admin read, reply (notifying the patient) and close", async () => {
    const thread = await request(app).get(`/admin/patient-inquiries/${conversationId}/messages`).set("Cookie", adminHere.cookie);
    expect(thread.status).toBe(200);
    expect(thread.body.messages[0].fromPatient).toBe(true);

    const reply = await request(app).post(`/admin/patient-inquiries/${conversationId}/messages`).set("Cookie", adminHere.cookie).send({ content: "Happy to walk you through it." });
    expect(reply.status).toBe(201);
    const patientAlerts = await db.select().from(notification).where(and(eq(notification.recipientId, patientActor.id), eq(notification.type, "NEW_MESSAGE")));
    expect(patientAlerts.length).toBeGreaterThan(0);

    const closed = await request(app).post(`/admin/patient-inquiries/${conversationId}/close`).set("Cookie", adminHere.cookie);
    expect(closed.status).toBe(200);
    const after = await request(app).post(`/admin/patient-inquiries/${conversationId}/messages`).set("Cookie", adminHere.cookie).send({ content: "late" });
    expect(after.status).toBe(409);
  });

  it("is not reachable by a patient or a VMO", async () => {
    expect((await request(app).get("/admin/patient-inquiries").set("Cookie", patientActor.cookie)).status).toBe(403);
    expect((await request(app).get("/admin/patient-inquiries").set("Cookie", vmoA.cookie)).status).toBe(403);
  });

  it("does not serve side-effect chats through the admin routes", async () => {
    const [c] = await db.insert(conversation).values({ id: crypto.randomUUID(), patientId, conversationType: "MO_SIDE_EFFECT", status: "OPEN" }).returning();
    const res = await request(app).get(`/admin/patient-inquiries/${c!.id}/messages`).set("Cookie", adminHere.cookie);
    expect(res.status).toBe(404);
  });
});

describe("VMOs claim unclaimed side-effect reports", () => {
  let reportId: string;

  beforeAll(async () => {
    const [c] = await db.insert(conversation).values({ id: crypto.randomUUID(), patientId, conversationType: "MO_SIDE_EFFECT", status: "OPEN" }).returning();
    reportId = c!.id;
  });

  it("shows the unclaimed report to every VMO but not in their own inbox", async () => {
    for (const vmo of [vmoA, vmoB]) {
      const res = await request(app).get("/vmo/unclaimed").set("Cookie", vmo.cookie);
      expect(res.status).toBe(200);
      const item = res.body.conversations.find((c: { id: string }) => c.id === reportId);
      expect(item).toBeDefined();
      expect(item.patient.uniquePatientId).toMatch(/^ROUTE-/);
      const inbox = await request(app).get("/vmo/inbox").set("Cookie", vmo.cookie);
      expect(inbox.body.conversations.some((c: { id: string }) => c.id === reportId)).toBe(false);
    }
  });

  it("lets exactly one VMO claim it, after which it is theirs", async () => {
    const [a, b] = await Promise.all([
      request(app).post(`/vmo/conversations/${reportId}/claim`).set("Cookie", vmoA.cookie),
      request(app).post(`/vmo/conversations/${reportId}/claim`).set("Cookie", vmoB.cookie),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? vmoA : vmoB;
    const loser = a.status === 200 ? vmoB : vmoA;

    const inbox = await request(app).get("/vmo/inbox").set("Cookie", winner.cookie);
    expect(inbox.body.conversations.some((c: { id: string }) => c.id === reportId)).toBe(true);
    const gone = await request(app).get("/vmo/unclaimed").set("Cookie", loser.cookie);
    expect(gone.body.conversations.some((c: { id: string }) => c.id === reportId)).toBe(false);
    const row = await db.select().from(conversation).where(eq(conversation.id, reportId));
    expect(row[0]!.assignedTo).toBe(winner.id);
  });

  it("rejects a claim from a non-VMO", async () => {
    const res = await request(app).post(`/vmo/conversations/${reportId}/claim`).set("Cookie", adminHere.cookie);
    expect(res.status).toBe(403);
  });
});

describe("unread counts per conversation", () => {
  let id: string;
  const unreadFor = async (cookie: string, path: string) => {
    const res = await request(app).get(path).set("Cookie", cookie);
    return res;
  };

  it("counts the other side's unread messages and clears them when the thread is opened", async () => {
    const start = await request(app).post("/conversations").set("Cookie", patientActor.cookie).send({ patientId, conversationType: "ADMIN_INQUIRY" });
    id = start.body.conversation.id;
    for (const content of ["one", "two"]) {
      await request(app).post(`/conversations/${id}/messages`).set("Cookie", patientActor.cookie).send({ type: "TEXT", content });
    }

    const adminList = await unreadFor(adminHere.cookie, "/admin/patient-inquiries");
    expect(adminList.body.inquiries.find((i: { id: string }) => i.id === id).unreadCount).toBe(2);

    await request(app).get(`/admin/patient-inquiries/${id}/messages`).set("Cookie", adminHere.cookie);
    const afterOpen = await unreadFor(adminHere.cookie, "/admin/patient-inquiries");
    expect(afterOpen.body.inquiries.find((i: { id: string }) => i.id === id).unreadCount).toBe(0);
  });

  it("counts the admin's replies as unread for the patient until the patient opens the thread", async () => {
    await request(app).post(`/admin/patient-inquiries/${id}/messages`).set("Cookie", adminHere.cookie).send({ content: "reply 1" });
    await request(app).post(`/admin/patient-inquiries/${id}/messages`).set("Cookie", adminHere.cookie).send({ content: "reply 2" });
    await request(app).post(`/admin/patient-inquiries/${id}/messages`).set("Cookie", adminHere.cookie).send({ content: "reply 3" });

    const mine = await unreadFor(patientActor.cookie, `/conversations?patientId=${patientId}`);
    expect(mine.body.conversations.find((c: { id: string }) => c.id === id).unreadCount).toBe(3);

    await request(app).get(`/conversations/${id}/messages`).set("Cookie", patientActor.cookie);
    const after = await unreadFor(patientActor.cookie, `/conversations?patientId=${patientId}`);
    expect(after.body.conversations.find((c: { id: string }) => c.id === id).unreadCount).toBe(0);
  });

  it("shows a VMO the patient's unread messages on a claimed side-effect chat", async () => {
    const [c] = await db.insert(conversation).values({ id: crypto.randomUUID(), patientId, conversationType: "MO_SIDE_EFFECT", status: "OPEN" }).returning();
    await request(app).post(`/conversations/${c!.id}/messages`).set("Cookie", patientActor.cookie).send({ type: "TEXT", content: "itchy" });
    const unclaimed = await unreadFor(vmoA.cookie, "/vmo/unclaimed");
    expect(unclaimed.body.conversations.find((x: { id: string }) => x.id === c!.id).unreadCount).toBe(1);
    await request(app).post(`/vmo/conversations/${c!.id}/claim`).set("Cookie", vmoA.cookie);
    const inbox = await unreadFor(vmoA.cookie, "/vmo/inbox");
    expect(inbox.body.conversations.find((x: { id: string }) => x.id === c!.id).unreadCount).toBe(1);
  });
});

describe("attachments in chats are viewable by the people who may see the chat", () => {
  let inquiryId: string;
  let imageMessageId: string;
  let infectedMessageId: string;
  let sideEffectId: string;
  let sideEffectImageId: string;

  async function addImage(conversationId: string, scan: "CLEAN" | "INFECTED") {
    const fileId = crypto.randomUUID();
    await db.insert(file).values({
      id: fileId, patientId, uploadedBy: patientActor.id, storageKey: `patients/${patientId}/test/${fileId}.png`,
      mimeType: "image/png", virusScanStatus: scan, fileHash: crypto.randomUUID().replace(/-/g, ""),
    });
    const [m] = await db.insert(message).values({ id: crypto.randomUUID(), conversationId, senderId: patientActor.id, type: "IMAGE", content: fileId }).returning();
    return m!.id;
  }
  let conversationId: string;

  beforeAll(async () => {
    const [c] = await db.insert(conversation).values({ id: crypto.randomUUID(), patientId, conversationType: "ADMIN_INQUIRY", status: "OPEN" }).returning();
    inquiryId = c!.id;
    conversationId = inquiryId;
    imageMessageId = await addImage(inquiryId, "CLEAN");
    infectedMessageId = await addImage(inquiryId, "INFECTED");

    const [se] = await db.insert(conversation).values({ id: crypto.randomUUID(), patientId, conversationType: "MO_SIDE_EFFECT", status: "OPEN", assignedTo: vmoA.id }).returning();
    sideEffectId = se!.id;
    conversationId = sideEffectId;
    sideEffectImageId = await addImage(sideEffectId, "CLEAN");
  });

  it("lets the Regional Admin in the patient's region open an image through a signed link", async () => {
    const res = await request(app).get(`/admin/patient-inquiries/${inquiryId}/messages/${imageMessageId}/attachment`).set("Cookie", adminHere.cookie).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(".png");
    expect(res.headers["cache-control"]).toContain("no-store");
  });

  it("refuses an admin in another region, an infected file, and a message from a different chat", async () => {
    const other = await request(app).get(`/admin/patient-inquiries/${inquiryId}/messages/${imageMessageId}/attachment`).set("Cookie", adminElsewhere.cookie).redirects(0);
    expect(other.status).toBe(404);
    const infected = await request(app).get(`/admin/patient-inquiries/${inquiryId}/messages/${infectedMessageId}/attachment`).set("Cookie", adminHere.cookie).redirects(0);
    expect(infected.status).toBe(403);
    const wrongChat = await request(app).get(`/admin/patient-inquiries/${inquiryId}/messages/${sideEffectImageId}/attachment`).set("Cookie", adminHere.cookie).redirects(0);
    expect(wrongChat.status).toBe(404);
  });

  it("lets the VMO on a side-effect chat open its photo, and nobody else", async () => {
    const mine = await request(app).get(`/vmo/conversations/${sideEffectId}/messages/${sideEffectImageId}/attachment`).set("Cookie", vmoA.cookie).redirects(0);
    expect(mine.status).toBe(302);
    const notMine = await request(app).get(`/vmo/conversations/${sideEffectId}/messages/${sideEffectImageId}/attachment`).set("Cookie", vmoB.cookie).redirects(0);
    expect(notMine.status).toBe(403);
    const admin = await request(app).get(`/vmo/conversations/${sideEffectId}/messages/${sideEffectImageId}/attachment`).set("Cookie", adminHere.cookie).redirects(0);
    expect(admin.status).toBe(403);
  });
});
