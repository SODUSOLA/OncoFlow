import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient } from "../../patient/schema.js";
import { user, session } from "../../auth/schema.js";
import { countdownCase } from "../schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";

const app = createApp();
const base = "/countdown-cases";

let ownPatientId: string;
let ownCookie: string;
let otherCookie: string;

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Countdown Ownership Fac", region: "Lagos", address: "CO St", status: "ACTIVE",
  }).returning();
  const facId = facRows[0]!.id;

  const ownUserId = crypto.randomUUID();
  await db.insert(user).values({ id: ownUserId, email: `cd-own-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const ownSessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: ownSessionId, userId: ownUserId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  ownCookie = `${SESSION_COOKIE_NAME}=${ownSessionId}`;

  const otherUserId = crypto.randomUUID();
  await db.insert(user).values({ id: otherUserId, email: `cd-other-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const otherSessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: otherSessionId, userId: otherUserId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  otherCookie = `${SESSION_COOKIE_NAME}=${otherSessionId}`;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "CDOWN-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    userId: ownUserId,
    firstName: "CdOwn", lastName: "Test", dob: "1990-01-01", gender: "Female",
    phone: "+2348099993333", email: "cdown." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facId, status: "ACTIVE",
  }).returning();
  ownPatientId = patRows[0]!.id;

  await db.insert(countdownCase).values({
    id: crypto.randomUUID(), patientId: ownPatientId, currentDay: 5, status: "ACTIVE",
  });
});

describe("GET /countdown-cases?patientId= — ownership", () => {
  it("lets the linked patient read their own countdown case", async () => {
    const res = await request(app).get(`${base}?patientId=${ownPatientId}`).set("Cookie", ownCookie);
    expect(res.status).toBe(200);
    expect(res.body.cases).toHaveLength(1);
    expect(res.body.cases[0].patientId).toBe(ownPatientId);
  });

  it("rejects a different authenticated user with no countdownCase:read permission", async () => {
    const res = await request(app).get(`${base}?patientId=${ownPatientId}`).set("Cookie", otherCookie);
    expect(res.status).toBe(403);
  });

  it("rejects the staff-wide listing (no patientId) for a caller with no countdownCase:read permission", async () => {
    const res = await request(app).get(base).set("Cookie", ownCookie);
    expect(res.status).toBe(403);
  });
});
