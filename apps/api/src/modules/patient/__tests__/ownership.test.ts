import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session } from "../../auth/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { timelineService } from "../services/TimelineService.js";

const app = createApp();
const base = "/patients";

let testFacilityId: string;
let ownPatientId: string;
let ownUserId: string;
let ownCookie: string;
let otherUserId: string;
let otherCookie: string;

// A logged-in user with no roles/permissions at all — the "not this patient, and not staff
// either" case. Session-cookie login, mirrors request-context.test.ts's pattern, since these
// checks depend on the real cookie -> session -> userId derivation, not a synthetic req.userId.
async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, email: `owner-test-${crypto.randomUUID()}@example.com`, passwordHash: "test",
  });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Ownership Test Facility", region: "Lagos", address: "Own St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const own = await createSessionCookie();
  ownUserId = own.userId;
  ownCookie = own.cookie;

  const other = await createSessionCookie();
  otherUserId = other.userId;
  otherCookie = other.cookie;
  void otherUserId;

  const reg = await request(app).post(base).send({
    uniquePatientId: "OWN-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Owner", lastName: "Test", dob: "1990-01-01", gender: "Female",
    phone: "+2348012223333", email: "owner." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: testFacilityId, userId: ownUserId,
  });
  ownPatientId = reg.body.patient.id;
});

describe("GET /patients/me — self-lookup entry point", () => {
  it("resolves the linked patient record from the caller's own session", async () => {
    const res = await request(app).get(`${base}/me`).set("Cookie", ownCookie);
    expect(res.status).toBe(200);
    expect(res.body.patient.id).toBe(ownPatientId);
    expect(res.body.patient.phone).toBe("+2348012223333");
  });

  it("returns 404 for an authenticated user with no linked patient record", async () => {
    const res = await request(app).get(`${base}/me`).set("Cookie", otherCookie);
    expect(res.status).toBe(404);
  });
});

describe("GET /patients/:id — ownership (no blanket patient:read needed for own record)", () => {
  it("lets the linked user read their own record (toOwnJSON — includes phone)", async () => {
    const res = await request(app).get(`${base}/${ownPatientId}`).set("Cookie", ownCookie);
    expect(res.status).toBe(200);
    expect(res.body.patient.phone).toBe("+2348012223333");
  });

  it("rejects a different authenticated user with no patient:read permission — 'cannot view any other patient's data'", async () => {
    const res = await request(app).get(`${base}/${ownPatientId}`).set("Cookie", otherCookie);
    expect(res.status).toBe(403);
  });
});

describe("PUT /patients/:id — self-edit is scoped to non-clinical fields only", () => {
  it("applies phone/secondaryEmail/profilePictureFileId but silently ignores firstName for a self-edit", async () => {
    const fileId = crypto.randomUUID();
    const res = await request(app)
      .put(`${base}/${ownPatientId}`)
      .set("Cookie", ownCookie)
      .send({ firstName: "ShouldNotApply", phone: "+2348099998888", secondaryEmail: "second@example.com", profilePictureFileId: fileId });

    expect(res.status).toBe(200);
    expect(res.body.patient.firstName).toBe("Owner"); // unchanged
    expect(res.body.patient.phone).toBe("+2348099998888");
    expect(res.body.patient.secondaryEmail).toBe("second@example.com");
    expect(res.body.patient.profilePictureFileId).toBe(fileId);
  });

  it("rejects a different authenticated user with no patient:update permission", async () => {
    const res = await request(app)
      .put(`${base}/${ownPatientId}`)
      .set("Cookie", otherCookie)
      .send({ phone: "+2348000000000" });
    expect(res.status).toBe(403);
  });
});

describe("GET /wallet — ownership", () => {
  it("lets the linked user read their own wallet", async () => {
    const res = await request(app).get(`/wallet?patientId=${ownPatientId}`).set("Cookie", ownCookie);
    expect(res.status).toBe(200);
    expect(res.body.wallet).toBeDefined();
  });

  it("rejects a different authenticated user with no wallet:read permission", async () => {
    const res = await request(app).get(`/wallet?patientId=${ownPatientId}`).set("Cookie", otherCookie);
    expect(res.status).toBe(403);
  });
});

describe("GET /patients/:id/timeline — ownership", () => {
  it("lets the linked user read their own timeline", async () => {
    await timelineService.record({ patientId: ownPatientId, eventType: "REGISTRATION", referenceId: ownPatientId });
    const res = await request(app).get(`${base}/${ownPatientId}/timeline`).set("Cookie", ownCookie);
    expect(res.status).toBe(200);
    expect(res.body.events.some((e: { eventType: string }) => e.eventType === "REGISTRATION")).toBe(true);
  });

  it("rejects a different authenticated user with no patient:read permission", async () => {
    const res = await request(app).get(`${base}/${ownPatientId}/timeline`).set("Cookie", otherCookie);
    expect(res.status).toBe(403);
  });
});
