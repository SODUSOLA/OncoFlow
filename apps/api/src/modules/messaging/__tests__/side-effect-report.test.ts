import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient, wallet } from "../../patient/schema.js";
import { user, session } from "../../auth/schema.js";
import { serviceClassification } from "../../billing/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { sideEffectReportFeeKobo } from "../entities/side-effect-pricing.js";

const app = createApp();
const base = "/conversations/side-effect-report";

let testFacilityId: string;
let feeKobo: bigint;

let fundedPatientId: string;
let fundedCookie: string;
let brokePatientId: string;
let brokeCookie: string;
let otherCookie: string;

async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, email: `ser-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

async function createPatientWithWallet(userId: string, balanceKobo: bigint) {
  const rows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "SER-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    userId,
    firstName: "SideEffect", lastName: "Test", dob: "1990-01-01", gender: "Female",
    phone: "+2348099990000", email: "ser." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: testFacilityId, status: "ACTIVE",
  }).returning();
  const patientId = rows[0]!.id;
  await db.insert(wallet).values({ id: crypto.randomUUID(), patientId, balanceKobo });
  return patientId;
}

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Side Effect Report Test Facility", region: "Lagos", address: "SE St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const existingClass = await db.select().from(serviceClassification)
    .where(sql`${serviceClassification.name}::text = 'SIDE_EFFECT_REPORT'`).limit(1);
  if (existingClass.length === 0) {
    await db.insert(serviceClassification).values({
      id: crypto.randomUUID(), name: "SIDE_EFFECT_REPORT", cappedNetworkFeeKobo: 300000n,
    });
  }

  // Fee is time-of-day dynamic (side-effect-pricing.test.ts covers the day/night boundaries
  // themselves) — this suite just needs "the amount the endpoint should charge right now".
  feeKobo = sideEffectReportFeeKobo();

  const funded = await createSessionCookie();
  fundedCookie = funded.cookie;
  fundedPatientId = await createPatientWithWallet(funded.userId, feeKobo * 10n);

  const broke = await createSessionCookie();
  brokeCookie = broke.cookie;
  brokePatientId = await createPatientWithWallet(broke.userId, 0n);

  const other = await createSessionCookie();
  otherCookie = other.cookie;
});

describe("POST /conversations/side-effect-report", () => {
  it("charges the fee, creates a PAID invoice, and starts the conversation when the wallet can cover it", async () => {
    const res = await request(app).post(base).set("Cookie", fundedCookie).send({
      patientId: fundedPatientId, message: "I've had a rash since yesterday.",
    });
    expect(res.status).toBe(201);
    expect(res.body.conversation.conversationType).toBe("MO_SIDE_EFFECT");
    expect(res.body.invoice.status).toBe("PAID");
    expect(res.body.invoice.totalKobo).toBe(feeKobo.toString());
    expect(res.body.message.content).toBe("I've had a rash since yesterday.");
  });

  it("returns 402 with the unpaid invoice and creates no conversation when the wallet balance is too low", async () => {
    const before = await request(app).get(`/conversations?patientId=${brokePatientId}`).set("Cookie", brokeCookie);
    const beforeCount = before.body.conversations.length;

    const res = await request(app).post(base).set("Cookie", brokeCookie).send({
      patientId: brokePatientId, message: "Feeling dizzy after treatment.",
    });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("Insufficient wallet balance");
    expect(res.body.invoice.status).toBe("SENT");

    const after = await request(app).get(`/conversations?patientId=${brokePatientId}`).set("Cookie", brokeCookie);
    expect(after.body.conversations.length).toBe(beforeCount);
  });

  it("rejects a different authenticated user reporting on someone else's patient record", async () => {
    const res = await request(app).post(base).set("Cookie", otherCookie).send({
      patientId: fundedPatientId, message: "Should not be allowed.",
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /conversations — the free path no longer accepts patient-initiated MO_SIDE_EFFECT", () => {
  it("rejects a patient starting MO_SIDE_EFFECT through the generic endpoint", async () => {
    const res = await request(app).post("/conversations").set("Cookie", fundedCookie).send({
      patientId: fundedPatientId, conversationType: "MO_SIDE_EFFECT",
    });
    expect(res.status).toBe(403);
  });

  it("still lets staff start MO_SIDE_EFFECT for a patient for free (no invoice involved)", async () => {
    const res = await request(app).post("/conversations").send({
      patientId: fundedPatientId, conversationType: "MO_SIDE_EFFECT",
    });
    expect(res.status).toBe(201);
    expect(res.body.conversation.conversationType).toBe("MO_SIDE_EFFECT");
  });
});
