import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient, wallet } from "../../patient/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { serviceClassification } from "../../billing/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { sideEffectReportFeeKobo } from "../entities/side-effect-pricing.js";
import { seedIdentity } from "../../../seed/identity.js";
import { NotificationRepository } from "../../notification/index.js";

const app = createApp();
const base = "/conversations/side-effect-report";
const notificationRepo = new NotificationRepository();

let testFacilityId: string;

let patientId: string;
let patientUserId: string;
let patientCookie: string;
let vmoCookie: string;
let otherCookie: string;

async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, email: `sel-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

beforeAll(async () => {
  await seedIdentity();

  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Side Effect Lifecycle Test Facility", region: "Lagos", address: "SEL St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const existingClass = await db.select().from(serviceClassification)
    .where(sql`${serviceClassification.name}::text = 'SIDE_EFFECT_REPORT'`).limit(1);
  if (existingClass.length === 0) {
    await db.insert(serviceClassification).values({
      id: crypto.randomUUID(), name: "SIDE_EFFECT_REPORT", cappedNetworkFeeKobo: 300000n,
    });
  }

  const patientOwner = await createSessionCookie();
  patientCookie = patientOwner.cookie;
  patientUserId = patientOwner.userId;
  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "SEL-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    userId: patientOwner.userId,
    firstName: "Lifecycle", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348099991111", email: "sel." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: testFacilityId, status: "ACTIVE",
  }).returning();
  patientId = patRows[0]!.id;
  await db.insert(wallet).values({ id: crypto.randomUUID(), patientId, balanceKobo: sideEffectReportFeeKobo() * 20n });

  const vmo = await createSessionCookie();
  vmoCookie = vmo.cookie;
  const vmoRoleRow = await db.select().from(role).where(eq(role.name, "VIRTUAL_MEDICAL_OFFICER")).limit(1);
  await db.insert(userRole).values({ userId: vmo.userId, roleId: vmoRoleRow[0]!.id });

  const other = await createSessionCookie();
  otherCookie = other.cookie;
});

async function startReport(cookie: string, message = "Testing lifecycle") {
  const res = await request(app).post(base).set("Cookie", cookie).send({ patientId, message });
  return res;
}

// Shared mutable state between sequential `it` blocks in the first describe below — that
// suite is deliberately a linear story (open -> close -> reject -> re-report), not independent
// cases, so passing IDs forward this way is clearer than re-deriving them in every block.
const sharedState: { openConversationId?: string; secondConversationId?: string } = {};

describe("Side-effect report lifecycle — close, reopen, and re-report", () => {
  it("rejects starting a second report while one is already open", async () => {
    const first = await startReport(patientCookie);
    expect(first.status).toBe(201);

    const second = await startReport(patientCookie, "Trying again while one is open");
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already have an open/i);

    const convoId = first.body.conversation.id;

    sharedState.openConversationId = convoId;
  });

  it("lets the patient close their own report", async () => {
    const res = await request(app).post(`/conversations/${sharedState.openConversationId}/close`).set("Cookie", patientCookie);
    expect(res.status).toBe(200);
    expect(res.body.conversation.status).toBe("CLOSED");
  });

  it("rejects a new message to a closed conversation", async () => {
    // No senderId — the server attributes the message to the authenticated session, and the
    // route now rejects a body that supplies one.
    const res = await request(app).post(`/conversations/${sharedState.openConversationId}/messages`).set("Cookie", patientCookie).send({
      type: "TEXT",
      content: "Are you still there?",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("This conversation has been closed");
  });

  it("does not resurrect the closed conversation — starting a report again creates a brand new one", async () => {
    const res = await startReport(patientCookie, "New incident after the first was closed");
    expect(res.status).toBe(201);
    expect(res.body.conversation.id).not.toBe(sharedState.openConversationId);
    sharedState.secondConversationId = res.body.conversation.id;
  });

  it("lets a Virtual Medical Officer close a conversation via permission, not ownership", async () => {
    const res = await request(app).post(`/conversations/${sharedState.secondConversationId}/close`).set("Cookie", vmoCookie);
    expect(res.status).toBe(200);
    expect(res.body.conversation.status).toBe("CLOSED");
  });

  it("rejects a random authenticated user with no permission from closing someone else's conversation", async () => {
    const third = await startReport(patientCookie, "Third incident");
    expect(third.status).toBe(201);
    const res = await request(app).post(`/conversations/${third.body.conversation.id}/close`).set("Cookie", otherCookie);
    expect(res.status).toBe(403);

    // Leaves an OPEN conversation behind otherwise — clean up so later describe blocks in this
    // file can start their own fresh report for this same patient.
    await request(app).post(`/conversations/${third.body.conversation.id}/close`).set("Cookie", patientCookie);
  });
});

describe("Conversation feedback — mutual, closed-only, one per rater", () => {
  let feedbackConvoId: string;

  beforeAll(async () => {
    const started = await startReport(patientCookie, "Feedback test incident");
    expect(started.status).toBe(201);
    feedbackConvoId = started.body.conversation.id;
  });

  it("rejects feedback while the conversation is still open", async () => {
    const res = await request(app).post(`/conversations/${feedbackConvoId}/feedback`).set("Cookie", patientCookie).send({
      rating: 5, review: "Too soon",
    });
    expect(res.status).toBe(409);
  });

  it("lets the patient submit feedback once the conversation is closed", async () => {
    const close = await request(app).post(`/conversations/${feedbackConvoId}/close`).set("Cookie", patientCookie);
    expect(close.status).toBe(200);

    const res = await request(app).post(`/conversations/${feedbackConvoId}/feedback`).set("Cookie", patientCookie).send({
      rating: 4, review: "Quick and helpful response.",
    });
    expect(res.status).toBe(201);
    expect(res.body.feedback.raterRole).toBe("PATIENT");
    expect(res.body.feedback.rating).toBe(4);
  });

  it("rejects a second feedback submission from the same rater", async () => {
    const res = await request(app).post(`/conversations/${feedbackConvoId}/feedback`).set("Cookie", patientCookie).send({
      rating: 2, review: "Changed my mind",
    });
    expect(res.status).toBe(409);
  });

  it("lets staff (the VMO) submit their own independent feedback on the same conversation", async () => {
    const res = await request(app).post(`/conversations/${feedbackConvoId}/feedback`).set("Cookie", vmoCookie).send({
      rating: 5, review: "Patient described symptoms clearly.",
    });
    expect(res.status).toBe(201);
    expect(res.body.feedback.raterRole).toBe("STAFF");
  });

  it("notifies the patient once staff's feedback lands (patient's userId is always resolvable)", async () => {
    const notifications = await notificationRepo.findByRecipient(patientUserId);
    expect(notifications.some((n) => n.type === "CONVERSATION_FEEDBACK")).toBe(true);
  });

  it("lists both the patient's and staff's feedback together", async () => {
    const res = await request(app).get(`/conversations/${feedbackConvoId}/feedback`).set("Cookie", patientCookie);
    expect(res.status).toBe(200);
    expect(res.body.feedback).toHaveLength(2);
    const roles = res.body.feedback.map((f: { raterRole: string }) => f.raterRole).sort();
    expect(roles).toEqual(["PATIENT", "STAFF"]);
  });

  it("rejects a random authenticated user with no permission from reading or submitting feedback", async () => {
    const submit = await request(app).post(`/conversations/${feedbackConvoId}/feedback`).set("Cookie", otherCookie).send({ rating: 3 });
    expect(submit.status).toBe(403);
    const list = await request(app).get(`/conversations/${feedbackConvoId}/feedback`).set("Cookie", otherCookie);
    expect(list.status).toBe(403);
  });

  it("rejects an out-of-range rating", async () => {
    const started = await startReport(patientCookie, "Another incident for validation test");
    expect(started.status).toBe(201);
    await request(app).post(`/conversations/${started.body.conversation.id}/close`).set("Cookie", patientCookie);
    const res = await request(app).post(`/conversations/${started.body.conversation.id}/feedback`).set("Cookie", patientCookie).send({
      rating: 7,
    });
    expect(res.status).toBe(400);
  });
});
