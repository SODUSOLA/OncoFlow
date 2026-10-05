import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, and, inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { patient } from "../../patient/schema.js";
import { conversation } from "../../messaging/schema.js";
import { notification } from "../../notification/schema.js";
import { triageQuestion, triageAnswer, specialistEscalation } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";
import { slaStateFor } from "../service.js";

const app = createApp();
type TestUser = { id: string; cookie: string };

let facilityId: string;
let patientId: string;
let vmo: TestUser;
let otherVmo: TestUser;
let nurse: TestUser;
let admin: TestUser;
let otherRegionAdmin: TestUser;
let director: TestUser;
let questionIds: string[] = [];
// Every question this file ever inserts, so afterAll can delete them (with their answers) instead of leaving junk in the shared dev DB.
const createdQuestionIds: string[] = [];
let displaced: string[] = [];

async function createUser(roleName: string, facilityId_: string | null = null): Promise<TestUser> {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, email: `vmo-${crypto.randomUUID()}@test.com`, passwordHash: "test", facilityId: facilityId_ });
  const roleRow = await db.select().from(role).where(eq(role.name, roleName as never)).limit(1);
  await db.insert(userRole).values({ userId: id, roleId: roleRow[0]!.id });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId: id, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { id, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

async function openChat(assignedTo: string | null, status: "OPEN" | "CLOSED" = "OPEN", slaDeadline: Date | null = null): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(conversation).values({ id, patientId, conversationType: "MO_SIDE_EFFECT", status, assignedTo, slaDeadline });
  return id;
}

// Answers every question in order through the API.
async function completeChecklist(user_: TestUser, conversationId: string) {
  const start = await request(app).post(`/vmo/conversations/${conversationId}/triage`).set("Cookie", user_.cookie);
  expect(start.status).toBe(201);
  for (const q of start.body.triage.questions) {
    const r = await request(app).post(`/vmo/triage-sessions/${start.body.triage.sessionId}/answers`).set("Cookie", user_.cookie)
      .send({ questionId: q.id, answer: q.position % 2 === 0 });
    expect(r.status).toBe(200);
  }
}

beforeAll(async () => {
  await seedIdentity();
  // Other tests' questions (or real seeded ones) would change what "complete" means, so park them for the run.
  displaced = (await db.select({ id: triageQuestion.id }).from(triageQuestion).where(eq(triageQuestion.isActive, true))).map((r) => r.id);
  for (const id of displaced) await db.update(triageQuestion).set({ isActive: false }).where(eq(triageQuestion.id, id));

  facilityId = (await db.insert(facility).values({ id: crypto.randomUUID(), name: "VMO Test", region: "VMO-Region", address: "x", status: "ACTIVE" }).returning())[0]!.id;
  const otherFacility = (await db.insert(facility).values({ id: crypto.randomUUID(), name: "VMO Other", region: "VMO-Elsewhere", address: "x", status: "ACTIVE" }).returning())[0]!.id;
  patientId = crypto.randomUUID();
  await db.insert(patient).values({
    id: patientId, uniquePatientId: "VM-" + crypto.randomUUID().slice(0, 8).toUpperCase(), firstName: "Vee", lastName: "Em",
    dob: "1975-05-05", gender: "Female", phone: "+2348012340099", email: `vm.${crypto.randomUUID().slice(0, 6)}@example.com`,
    facilityId, status: "ACTIVE",
  });
  vmo = await createUser("VIRTUAL_MEDICAL_OFFICER");
  otherVmo = await createUser("VIRTUAL_MEDICAL_OFFICER");
  nurse = await createUser("ONSITE_NURSING_OFFICER", facilityId);
  admin = await createUser("REGIONAL_ADMIN", facilityId);
  otherRegionAdmin = await createUser("REGIONAL_ADMIN", otherFacility);
  director = await createUser("STATE_CLINICAL_DIRECTOR", facilityId);
});

afterAll(async () => {
  await db.delete(specialistEscalation).where(eq(specialistEscalation.patientId, patientId));
  if (createdQuestionIds.length > 0) {
    await db.delete(triageAnswer).where(inArray(triageAnswer.triageQuestionId, createdQuestionIds));
    await db.delete(triageQuestion).where(inArray(triageQuestion.id, createdQuestionIds));
  }
  for (const id of displaced) await db.update(triageQuestion).set({ isActive: true }).where(eq(triageQuestion.id, id));
});

async function seedQuestions(n: number) {
  questionIds = [];
  for (let i = 1; i <= n; i++) {
    const id = crypto.randomUUID();
    await db.insert(triageQuestion).values({
      id, position: i, prompt: `Q${i}?`, impactContext: "ctx", protocolReference: "proto", differentialDiagnosis: "dd", requiredEvidence: "ev",
    });
    questionIds.push(id);
    createdQuestionIds.push(id);
  }
}
async function retireQuestions() {
  for (const id of questionIds) await db.update(triageQuestion).set({ isActive: false }).where(eq(triageQuestion.id, id));
}

describe("VMO triage checklist gates the patient folder (server-side)", () => {
  it("fails closed when no questions exist: the folder can never unlock", async () => {
    const chat = await openChat(vmo.id);
    const start = await request(app).post(`/vmo/conversations/${chat}/triage`).set("Cookie", vmo.cookie);
    expect(start.status).toBe(201);
    expect(start.body.triage.total).toBe(0);
    expect(start.body.triage.completed).toBe(false);
    const folder = await request(app).get(`/vmo/conversations/${chat}/folder`).set("Cookie", vmo.cookie);
    expect(folder.status).toBe(403);
  });

  it("refuses the folder, medication triage and escalation until all questions are answered, then unlocks them", async () => {
    await seedQuestions(5);
    const chat = await openChat(vmo.id);
    expect((await request(app).get(`/vmo/conversations/${chat}/folder`).set("Cookie", vmo.cookie)).status).toBe(403);

    const start = await request(app).post(`/vmo/conversations/${chat}/triage`).set("Cookie", vmo.cookie);
    expect(start.body.triage.total).toBe(5);
    const sessionId = start.body.triage.sessionId;
    // Four of five: still locked, on every gated route.
    for (const q of start.body.triage.questions.slice(0, 4)) {
      await request(app).post(`/vmo/triage-sessions/${sessionId}/answers`).set("Cookie", vmo.cookie).send({ questionId: q.id, answer: true });
    }
    expect((await request(app).get(`/vmo/conversations/${chat}/folder`).set("Cookie", vmo.cookie)).status).toBe(403);
    expect((await request(app).get(`/vmo/conversations/${chat}/medication-triage`).set("Cookie", vmo.cookie)).status).toBe(403);
    expect((await request(app).post(`/vmo/conversations/${chat}/escalations`).set("Cookie", vmo.cookie).send({ triggerReason: "ANC < 1.5 Protocol" })).status).toBe(403);

    const last = start.body.triage.questions[4];
    const done = await request(app).post(`/vmo/triage-sessions/${sessionId}/answers`).set("Cookie", vmo.cookie).send({ questionId: last.id, answer: false });
    expect(done.body.triage.completed).toBe(true);

    const folder = await request(app).get(`/vmo/conversations/${chat}/folder`).set("Cookie", vmo.cookie);
    expect(folder.status).toBe(200);
    expect(folder.body.patient.uniquePatientId).toMatch(/^VM-/);
    const med = await request(app).get(`/vmo/conversations/${chat}/medication-triage`).set("Cookie", vmo.cookie);
    expect(med.status).toBe(200);
    expect(med.body.cards.map((c: { key: string }) => c.key)).toEqual(["drugsUsed", "lastLabs", "vitalTimelines"]);
    await retireQuestions();
  });

  it("requires answers in order and never lets one be overwritten", async () => {
    await seedQuestions(3);
    const chat = await openChat(vmo.id);
    const start = await request(app).post(`/vmo/conversations/${chat}/triage`).set("Cookie", vmo.cookie);
    const [q1, q2] = start.body.triage.questions;
    const sessionId = start.body.triage.sessionId;
    const skip = await request(app).post(`/vmo/triage-sessions/${sessionId}/answers`).set("Cookie", vmo.cookie).send({ questionId: q2.id, answer: true });
    expect(skip.status).toBe(409);
    expect((await request(app).post(`/vmo/triage-sessions/${sessionId}/answers`).set("Cookie", vmo.cookie).send({ questionId: q1.id, answer: true })).status).toBe(200);
    const again = await request(app).post(`/vmo/triage-sessions/${sessionId}/answers`).set("Cookie", vmo.cookie).send({ questionId: q1.id, answer: false });
    expect(again.status).toBe(409);
    await retireQuestions();
  });

  it("is limited to the VMO's own open chat", async () => {
    await seedQuestions(1);
    const chat = await openChat(vmo.id);
    expect((await request(app).post(`/vmo/conversations/${chat}/triage`).set("Cookie", otherVmo.cookie)).status).toBe(403);
    expect((await request(app).post(`/vmo/conversations/${chat}/triage`).set("Cookie", nurse.cookie)).status).toBe(403);
    const closed = await openChat(vmo.id, "CLOSED");
    expect((await request(app).post(`/vmo/conversations/${closed}/triage`).set("Cookie", vmo.cookie)).status).toBe(409);
    // A session can't be answered by someone else.
    const start = await request(app).post(`/vmo/conversations/${chat}/triage`).set("Cookie", vmo.cookie);
    const stolen = await request(app).post(`/vmo/triage-sessions/${start.body.triage.sessionId}/answers`).set("Cookie", otherVmo.cookie)
      .send({ questionId: questionIds[0], answer: true });
    expect(stolen.status).toBe(404);
    // Closing the chat after completing locks the folder again.
    await request(app).post(`/vmo/triage-sessions/${start.body.triage.sessionId}/answers`).set("Cookie", vmo.cookie).send({ questionId: questionIds[0], answer: true });
    expect((await request(app).get(`/vmo/conversations/${chat}/folder`).set("Cookie", vmo.cookie)).status).toBe(200);
    await db.update(conversation).set({ status: "CLOSED" }).where(eq(conversation.id, chat));
    expect((await request(app).get(`/vmo/conversations/${chat}/folder`).set("Cookie", vmo.cookie)).status).toBe(409);
    await retireQuestions();
  });
});

describe("Specialist escalation", () => {
  it("notifies the Regional Admin and Clinical Director, blocks duplicates, and lets only the regional admin advance it", async () => {
    await seedQuestions(2);
    const chat = await openChat(vmo.id);
    await completeChecklist(vmo, chat);

    const created = await request(app).post(`/vmo/conversations/${chat}/escalations`).set("Cookie", vmo.cookie).send({ triggerReason: "ANC < 1.5 Protocol" });
    expect(created.status).toBe(201);
    expect(created.body.escalation.status).toBe("NOTIFIED");
    const id = created.body.escalation.id;

    for (const u of [admin, director]) {
      const n = await db.select().from(notification).where(and(eq(notification.recipientId, u.id), eq(notification.type, "SPECIALIST_ESCALATION")));
      expect(n.length).toBe(1);
    }
    const stranger = await db.select().from(notification).where(eq(notification.recipientId, otherRegionAdmin.id));
    expect(stranger.length).toBe(0);

    const dup = await request(app).post(`/vmo/conversations/${chat}/escalations`).set("Cookie", vmo.cookie).send({ triggerReason: "ANC < 1.5 Protocol" });
    expect(dup.status).toBe(409);
    const badRef = await request(app).post(`/vmo/conversations/${chat}/escalations`).set("Cookie", vmo.cookie)
      .send({ triggerReason: "Other", triggerReference: crypto.randomUUID() });
    expect(badRef.status).toBe(409);

    // Region-scoped visibility.
    const adminList = await request(app).get("/escalations").set("Cookie", admin.cookie);
    expect(adminList.body.escalations.some((e: { id: string }) => e.id === id)).toBe(true);
    const otherList = await request(app).get("/escalations").set("Cookie", otherRegionAdmin.cookie);
    expect(otherList.body.escalations.some((e: { id: string }) => e.id === id)).toBe(false);
    expect((await request(app).get("/escalations").set("Cookie", director.cookie)).status).toBe(200);

    // Only the regional admin, inside their region, can move it.
    expect((await request(app).patch(`/escalations/${id}/status`).set("Cookie", director.cookie).send({ status: "CONSULT_SCHEDULED" })).status).toBe(403);
    expect((await request(app).patch(`/escalations/${id}/status`).set("Cookie", otherRegionAdmin.cookie).send({ status: "CONSULT_SCHEDULED" })).status).toBe(403);
    expect((await request(app).patch(`/escalations/${id}/status`).set("Cookie", vmo.cookie).send({ status: "RESOLVED" })).status).toBe(403);
    const scheduled = await request(app).patch(`/escalations/${id}/status`).set("Cookie", admin.cookie).send({ status: "CONSULT_SCHEDULED" });
    expect(scheduled.body.escalation.status).toBe("CONSULT_SCHEDULED");
    expect((await request(app).patch(`/escalations/${id}/status`).set("Cookie", admin.cookie).send({ status: "RESOLVED" })).status).toBe(200);
    // Terminal: no reversing.
    expect((await request(app).patch(`/escalations/${id}/status`).set("Cookie", admin.cookie).send({ status: "CONSULT_SCHEDULED" })).status).toBe(409);
    // Once resolved, the same reason may be escalated afresh.
    expect((await request(app).post(`/vmo/conversations/${chat}/escalations`).set("Cookie", vmo.cookie).send({ triggerReason: "ANC < 1.5 Protocol" })).status).toBe(201);
    await retireQuestions();
  });

  it("does not let a nursing officer or unassigned VMO escalate", async () => {
    await seedQuestions(1);
    const chat = await openChat(vmo.id);
    await completeChecklist(vmo, chat);
    expect((await request(app).post(`/vmo/conversations/${chat}/escalations`).set("Cookie", nurse.cookie).send({ triggerReason: "x" })).status).toBe(403);
    expect((await request(app).post(`/vmo/conversations/${chat}/escalations`).set("Cookie", otherVmo.cookie).send({ triggerReason: "x" })).status).toBe(403);
    await retireQuestions();
  });
});

describe("VMO inbox", () => {
  it("lists only the caller's chats with the patient mini-card and one SLA state", async () => {
    const chat = await openChat(vmo.id, "OPEN", new Date(Date.now() + 30_000));
    const mine = await request(app).get("/vmo/inbox").set("Cookie", vmo.cookie);
    expect(mine.status).toBe(200);
    const row = mine.body.conversations.find((c: { id: string }) => c.id === chat);
    expect(row.patient.uniquePatientId).toMatch(/^VM-/);
    expect(row.patient.age).toBeGreaterThan(40);
    expect(row.triageCompleted).toBe(false);
    expect(row.slaState).toBe("WARNING");
    expect(Object.keys(row.patient).sort()).toEqual(["age", "firstName", "lastName", "uniquePatientId"]);
    const theirs = await request(app).get("/vmo/inbox").set("Cookie", otherVmo.cookie);
    expect(theirs.body.conversations.some((c: { id: string }) => c.id === chat)).toBe(false);
    expect((await request(app).get("/vmo/inbox").set("Cookie", nurse.cookie)).status).toBe(403);
  });

  it("derives one SLA state per thread", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    const base = { status: "OPEN", slaBreached: false, firstResponseAt: null as Date | null };
    const at = (s: number) => new Date(now.getTime() + s * 1000);
    expect(slaStateFor({ ...base, slaDeadline: at(90) }, now)).toBe("STABLE");
    expect(slaStateFor({ ...base, slaDeadline: at(30) }, now)).toBe("WARNING");
    expect(slaStateFor({ ...base, slaDeadline: at(-5) }, now)).toBe("CRITICAL");
    expect(slaStateFor({ ...base, slaBreached: true, slaDeadline: at(90) }, now)).toBe("CRITICAL");
    expect(slaStateFor({ ...base, firstResponseAt: now, slaDeadline: at(-5) }, now)).toBe("STABLE");
    expect(slaStateFor({ ...base, status: "CLOSED", slaBreached: true, slaDeadline: at(-5) }, now)).toBe("RESOLVED");
  });
});
