import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { timelineService } from "../services/TimelineService";
import { db } from "../../../db";
import { patient } from "../schema";
import { facility } from "../../facility/schema";

async function createTestPatient() {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(),
    name: "Timeline Test Facility",
    region: "Lagos",
    address: "TL St",
    status: "ACTIVE",
  }).returning();

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(),
    uniquePatientId: "TL-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Timeline",
    lastName: "Test",
    dob: "1990-01-01",
    gender: "Male",
    phone: "+2348012349999",
    email: "tl." + crypto.randomUUID().slice(0, 4) + "@example.com",
    facilityId: facRows[0]!.id,
    status: "ACTIVE",
  }).returning();

  return patRows[0]!;
}

describe("TimelineService", () => {
  it("records a timeline entry", async () => {
    const pat = await createTestPatient();
    await timelineService.record({
      patientId: pat.id,
      eventType: "STATUS_CHANGE",
      referenceId: pat.id,
    });

    const entries = await timelineService.getByPatient(pat.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.eventType).toBe("STATUS_CHANGE");
  });

  it("returns multiple entries in order", async () => {
    const pat = await createTestPatient();
    await timelineService.record({ patientId: pat.id, eventType: "REGISTRATION", referenceId: pat.id });
    await timelineService.record({ patientId: pat.id, eventType: "CONSULTATION", referenceId: crypto.randomUUID() });

    const entries = await timelineService.getByPatient(pat.id);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.eventType).toBe("REGISTRATION");
    expect(entries[1]!.eventType).toBe("CONSULTATION");
  });
});
