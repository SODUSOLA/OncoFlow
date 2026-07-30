import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { PrescriptionService } from "../service.js";
import { db } from "../../../db/index.js";
import { patient } from "../../patient/schema.js";
import { facility } from "../../facility/schema.js";
import { user, role, userRole } from "../../auth/schema.js";
import { triageChecklist } from "../schema.js";
import { conversation } from "../../messaging/schema.js";
import { sql } from "drizzle-orm";

const prescriptionSvc = new PrescriptionService();

let testPatientId: string;
let moUserId: string;
let oncologistUserId: string;
let testTriageChecklistId: string;

async function ensureRole(name: string) {
  const existing = await db.execute<{ id: string }>(sql`SELECT id FROM "role" WHERE name = ${name} LIMIT 1`);
  if (existing.length > 0) return existing[0]!.id;
  const id = crypto.randomUUID();
  await db.insert(role).values({ id, name: name as never, description: "Test" });
  return id;
}

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Prescription Test Facility", region: "Lagos", address: "P St", status: "ACTIVE",
  }).returning();
  const facId = facRows[0]!.id;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "RX-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Rx", lastName: "Test", dob: "1990-01-01", gender: "Female",
    phone: "+2348011117777", email: "rx." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;

  const moRoleId = await ensureRole("VIRTUAL_MEDICAL_OFFICER");
  const oncologistRoleId = await ensureRole("CONSULTING_ONCOLOGIST");

  const moRows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "rx-mo-" + crypto.randomUUID().slice(0, 4) + "@test.com", passwordHash: "test",
  }).returning();
  moUserId = moRows[0]!.id;
  await db.insert(userRole).values({ userId: moUserId, roleId: moRoleId });

  const oncologistRows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "rx-onc-" + crypto.randomUUID().slice(0, 4) + "@test.com", passwordHash: "test",
  }).returning();
  oncologistUserId = oncologistRows[0]!.id;
  await db.insert(userRole).values({ userId: oncologistUserId, roleId: oncologistRoleId });

  const convoRows = await db.insert(conversation).values({
    id: crypto.randomUUID(), patientId: testPatientId, conversationType: "MO_SIDE_EFFECT", status: "OPEN",
  }).returning();

  const triageRows = await db.insert(triageChecklist).values({
    id: crypto.randomUUID(), conversationId: convoRows[0]!.id, completedBy: moUserId, completedAt: new Date(),
    presentingComplaint: "Fatigue", duration: "1 day", functionalImpact: "Tired",
    priorMeasures: "None", canTalkWalkEat: "Yes",
  }).returning();
  testTriageChecklistId = triageRows[0]!.id;
});

describe("PrescriptionService.assertTriageRequiredIfMO (F3.3 DoD)", () => {
  it("rejects an MO prescribing without a triage_checklist_id", async () => {
    await expect(
      prescriptionSvc.create({ patientId: testPatientId, doctorId: moUserId }),
    ).rejects.toThrow("triage checklist");
  });

  it("allows an MO prescribing with a triage_checklist_id", async () => {
    const result = await prescriptionSvc.create({
      patientId: testPatientId, doctorId: moUserId, triageChecklistId: testTriageChecklistId,
    });
    expect(result.id).toBeDefined();
    expect(result.triageChecklistId).toBe(testTriageChecklistId);
  });

  it("allows a Consulting Oncologist prescribing without a triage_checklist_id", async () => {
    const result = await prescriptionSvc.create({ patientId: testPatientId, doctorId: oncologistUserId });
    expect(result.id).toBeDefined();
    expect(result.triageChecklistId).toBeNull();
  });
});
