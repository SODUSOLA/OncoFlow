import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { CalendarService } from "../services/CalendarService.js";
import { AppointmentRepository } from "../repository.js";
import { db } from "../../../db/index.js";
import { patient } from "../../patient/schema.js";
import { facility } from "../../facility/schema.js";
import { countdownCase } from "../../clinical/schema.js";

const calendarSvc = new CalendarService();
const apptRepo = new AppointmentRepository();

let facilityAId: string;
let facilityBId: string;
let patientAId: string;
let patientBId: string;

beforeAll(async () => {
  const facRows = await db.insert(facility).values([
    { id: crypto.randomUUID(), name: "Calendar Test A", region: "Lagos", address: "A St", status: "ACTIVE" },
    { id: crypto.randomUUID(), name: "Calendar Test B", region: "Lagos", address: "B St", status: "ACTIVE" },
  ]).returning();
  facilityAId = facRows[0]!.id;
  facilityBId = facRows[1]!.id;

  const patRows = await db.insert(patient).values([
    {
      id: crypto.randomUUID(), uniquePatientId: "CAL-A-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      firstName: "Cal", lastName: "PatientA", dob: "1990-01-01", gender: "Female",
      phone: "+2348011110000", email: "cala." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: facilityAId, status: "ACTIVE",
    },
    {
      id: crypto.randomUUID(), uniquePatientId: "CAL-B-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
      firstName: "Cal", lastName: "PatientB", dob: "1990-01-01", gender: "Male",
      phone: "+2348022220000", email: "calb." + crypto.randomUUID().slice(0, 4) + "@test.com",
      facilityId: facilityBId, status: "ACTIVE",
    },
  ]).returning();
  patientAId = patRows[0]!.id;
  patientBId = patRows[1]!.id;

  await apptRepo.create({
    patientId: patientAId, facilityId: facilityAId, appointmentType: "VIRTUAL",
    scheduledAt: new Date("2026-08-10T10:00:00Z"),
  });
  await apptRepo.create({
    patientId: patientBId, facilityId: facilityBId, appointmentType: "VIRTUAL",
    scheduledAt: new Date("2026-08-11T10:00:00Z"),
  });

  await db.insert(countdownCase).values([
    {
      id: crypto.randomUUID(), patientId: patientAId, currentDay: 6, status: "ACTIVE",
      labsPromptedAt: new Date("2026-08-05T09:00:00Z"),
    },
    {
      id: crypto.randomUUID(), patientId: patientBId, currentDay: 6, status: "ACTIVE",
      labsPromptedAt: new Date("2026-08-06T09:00:00Z"),
    },
  ]);
});

describe("CalendarService — unified calendar (FR-24)", () => {
  it("scoped to a patient only returns that patient's own items", async () => {
    const items = await calendarSvc.getUnifiedCalendar({ patientId: patientAId });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.patientId === patientAId)).toBe(true);
    expect(items.some((i) => i.kind === "appointment")).toBe(true);
    expect(items.some((i) => i.kind === "countdown_labs_prompted")).toBe(true);
  });

  it("scoped to a facility never includes another facility's patients", async () => {
    const items = await calendarSvc.getUnifiedCalendar({ facilityId: facilityAId });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.patientId !== patientBId)).toBe(true);
  });

  it("is sorted by date ascending", async () => {
    const items = await calendarSvc.getUnifiedCalendar({ facilityId: facilityAId });
    const dates = items.map((i) => i.date);
    expect(dates).toEqual([...dates].sort());
  });
});
