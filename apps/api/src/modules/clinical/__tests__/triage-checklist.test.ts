import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { TriageChecklistService } from "../service.js";
import { db } from "../../../db/index.js";
import { patient } from "../../patient/schema.js";
import { facility } from "../../facility/schema.js";
import { user } from "../../auth/schema.js";
import { conversation } from "../../messaging/schema.js";

const triageSvc = new TriageChecklistService();

let testConversationId: string;
let testMoUserId: string;

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Triage Test Facility", region: "Lagos", address: "T St", status: "ACTIVE",
  }).returning();
  const facId = facRows[0]!.id;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "TRI-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Triage", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348011118888", email: "triage." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: facId, status: "ACTIVE",
  }).returning();

  const moRows = await db.insert(user).values({
    id: crypto.randomUUID(), email: "triage-mo-" + crypto.randomUUID().slice(0, 4) + "@test.com", passwordHash: "test",
  }).returning();
  testMoUserId = moRows[0]!.id;

  const convoRows = await db.insert(conversation).values({
    id: crypto.randomUUID(), patientId: patRows[0]!.id, conversationType: "MO_SIDE_EFFECT", status: "OPEN",
  }).returning();
  testConversationId = convoRows[0]!.id;
});

const validAnswers = {
  presentingComplaint: "Nausea",
  duration: "2 days",
  functionalImpact: "Can't eat solid food",
  priorMeasures: "Took paracetamol, no relief",
  canTalkWalkEat: "Can talk and walk, limited eating",
};

describe("TriageChecklistService — 1:1 per conversation (F3.2 DoD)", () => {
  it("completes a triage checklist for a conversation", async () => {
    const result = await triageSvc.complete({ conversationId: testConversationId, completedBy: testMoUserId, ...validAnswers });
    expect(result.id).toBeDefined();
    expect(result.conversationId).toBe(testConversationId);
  });

  it("rejects a second triage checklist for the same conversation with a clear domain error, not a raw DB error", async () => {
    await expect(
      triageSvc.complete({ conversationId: testConversationId, completedBy: testMoUserId, ...validAnswers }),
    ).rejects.toThrow("A triage checklist already exists for this conversation");
  });
});
