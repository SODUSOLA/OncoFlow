import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient } from "../../patient/schema.js";
import { user, session } from "../../auth/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";

const app = createApp();

let testFacilityId: string;
let ownPatientId: string;
let ownAppointmentId: string;
let ownCookie: string;
let otherCookie: string;

// Walks forward to the next Mon/Wed/Fri (Africa/Lagos) slot, as VIRTUAL appointments require, so the suite is day-independent.
function nextVirtualSlot(): string {
  const candidate = new Date(Date.now() + 60 * 60 * 1000);
  for (let i = 0; i < 8; i++) {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", weekday: "short" })
      .format(candidate);
    if (weekday === "Mon" || weekday === "Wed" || weekday === "Fri") {
      return candidate.toISOString();
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  throw new Error("Could not find a Mon/Wed/Fri slot within a week");
}

// Creates a user and returns a valid session cookie for requests.
async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, email: `appt-owner-${crypto.randomUUID()}@example.com`, passwordHash: "test",
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
    id: crypto.randomUUID(), name: "Appt Ownership Fac", region: "Lagos", address: "AO St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const own = await createSessionCookie();
  ownCookie = own.cookie;
  const other = await createSessionCookie();
  otherCookie = other.cookie;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "APPTOWN-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    userId: own.userId,
    firstName: "ApptOwn", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348099993333", email: "apptown." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: testFacilityId, status: "ACTIVE",
  }).returning();
  ownPatientId = patRows[0]!.id;

  const created = await request(app).post("/appointments").send({
    patientId: ownPatientId, facilityId: testFacilityId,
    appointmentType: "VIRTUAL", scheduledAt: nextVirtualSlot(),
  });
  ownAppointmentId = created.body.appointment.id;
});

describe("GET /appointments/:id — ownership (join own scheduled video consult)", () => {
  it("lets the linked patient read their own appointment", async () => {
    const res = await request(app).get(`/appointments/${ownAppointmentId}`).set("Cookie", ownCookie);
    expect(res.status).toBe(200);
  });

  it("rejects a different authenticated user with no appointment:read permission", async () => {
    const res = await request(app).get(`/appointments/${ownAppointmentId}`).set("Cookie", otherCookie);
    expect(res.status).toBe(403);
  });
});

describe("GET /appointments?patientId= — ownership", () => {
  it("lets the linked patient list their own appointments", async () => {
    const res = await request(app).get(`/appointments?patientId=${ownPatientId}`).set("Cookie", ownCookie);
    expect(res.status).toBe(200);
    expect(res.body.appointments.some((a: { id: string }) => a.id === ownAppointmentId)).toBe(true);
  });

  it("rejects a different authenticated user with no appointment:read permission", async () => {
    const res = await request(app).get(`/appointments?patientId=${ownPatientId}`).set("Cookie", otherCookie);
    expect(res.status).toBe(403);
  });
});
