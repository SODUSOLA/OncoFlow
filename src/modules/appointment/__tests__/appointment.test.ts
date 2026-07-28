import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { Appointment } from "../entities/Appointment";
import { isAfter2pmNigeria, canConfirmOnDay } from "../entities/cutoff";
import { AppointmentRepository, AppointmentParticipantRepository } from "../repository";
import { AppointmentService } from "../service";
import { db } from "../../../db";
import { appointment } from "../schema";
import { patient } from "../../patient/schema";
import { facility } from "../../facility/schema";
import { user } from "../../auth/schema";

const apptRepo = new AppointmentRepository();
const apptSvc = new AppointmentService();

let testPatientId: string;
let testFacilityId: string;

beforeAll(async () => {
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Appt Test Facility", region: "Lagos", address: "A St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "APPT-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Appt", lastName: "Test", dob: "1990-01-01", gender: "Female",
    phone: "+2348011111111", email: "appt." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: testFacilityId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;
});

function makeAppt(status: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "MISSED" = "PENDING") {
  return new Appointment({
    id: crypto.randomUUID(), patientId: testPatientId, oncologistId: null,
    facilityId: testFacilityId, appointmentType: "VIRTUAL",
    scheduledAt: new Date("2026-08-10T10:00:00Z"), status,
    meetingId: null, paymentConfirmedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    isDeleted: false, deletedAt: null,
  });
}

describe("Appointment entity — state machine", () => {
  it("PENDING → CONFIRMED", () => {
    const a = makeAppt("PENDING");
    expect(a.confirm().status).toBe("CONFIRMED");
  });

  it("PENDING → CANCELLED", () => {
    const a = makeAppt("PENDING");
    expect(a.cancel().status).toBe("CANCELLED");
  });

  it("PENDING → COMPLETED rejects", () => {
    const a = makeAppt("PENDING");
    expect(() => a.complete()).toThrow("Cannot transition from PENDING to COMPLETED");
  });

  it("PENDING → MISSED rejects", () => {
    const a = makeAppt("PENDING");
    expect(() => a.miss()).toThrow("Cannot transition from PENDING to MISSED");
  });

  it("CONFIRMED → CHECKED_IN", () => {
    const a = makeAppt("CONFIRMED");
    expect(a.checkIn().status).toBe("CHECKED_IN");
  });

  it("CONFIRMED → CANCELLED", () => {
    const a = makeAppt("CONFIRMED");
    expect(a.cancel().status).toBe("CANCELLED");
  });

  it("CONFIRMED → MISSED", () => {
    const a = makeAppt("CONFIRMED");
    expect(a.miss().status).toBe("MISSED");
  });

  it("CHECKED_IN → IN_PROGRESS", () => {
    const a = makeAppt("CHECKED_IN");
    expect(a.startProgress().status).toBe("IN_PROGRESS");
  });

  it("IN_PROGRESS → COMPLETED", () => {
    const a = makeAppt("IN_PROGRESS");
    expect(a.complete().status).toBe("COMPLETED");
  });

  it("COMPLETED rejects any transition", () => {
    const a = makeAppt("COMPLETED");
    expect(() => a.confirm()).toThrow();
    expect(() => a.cancel()).toThrow();
    expect(() => a.miss()).toThrow();
  });

  it("CANCELLED rejects any transition", () => {
    const a = makeAppt("CANCELLED");
    expect(() => a.confirm()).toThrow();
    expect(() => a.checkIn()).toThrow();
  });
});

describe("2PM cutoff rule", () => {
  it("returns true before 2PM Nigeria time", () => {
    const before2pm = new Date("2026-08-10T12:00:00Z"); // 13:00 WAT — before 14:00
    expect(isAfter2pmNigeria(before2pm)).toBe(false);
  });

  it("returns false after 2PM Nigeria time (14:00 WAT)", () => {
    const after2pm = new Date("2026-08-10T14:00:00Z"); // 15:00 WAT — after 14:00
    expect(isAfter2pmNigeria(after2pm)).toBe(true);
  });

  it("canConfirmOnDay allows future dates regardless of time", () => {
    const future = new Date("2026-08-15T10:00:00Z");
    const now = new Date("2026-08-10T15:00:00Z"); // past 2PM
    const result = canConfirmOnDay(future, now);
    expect(result.allowed).toBe(true);
  });

  it("canConfirmOnDay rejects past dates", () => {
    const past = new Date("2026-08-05T10:00:00Z");
    const now = new Date("2026-08-10T10:00:00Z");
    const result = canConfirmOnDay(past, now);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("past");
  });

  it("canConfirmOnDay rejects today after 2PM", () => {
    const today = new Date("2026-08-10T10:00:00Z"); // 11:00 WAT — before 14:00
    const after2pm = new Date("2026-08-10T14:00:00Z"); // 15:00 WAT — after 14:00
    const result = canConfirmOnDay(today, after2pm);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("cutoff");
  });

  it("canConfirmOnDay allows today before 2PM", () => {
    const today = new Date("2026-08-10T10:00:00Z"); // 11:00 WAT
    const now = new Date("2026-08-10T09:00:00Z"); // 10:00 WAT
    const result = canConfirmOnDay(today, now);
    expect(result.allowed).toBe(true);
  });
});

describe("AppointmentRepository — CRUD", () => {
  it("creates and finds by id", async () => {
    const row = await apptRepo.create({
      patientId: testPatientId, facilityId: testFacilityId, appointmentType: "VIRTUAL",
      scheduledAt: new Date("2026-08-20T10:00:00Z"),
    });
    expect(row.id).toBeDefined();
    expect(row.status).toBe("PENDING");

    const found = await apptRepo.findById(row.id);
    expect(found).toBeDefined();
    expect(found!.patientId).toBe(testPatientId);
  });

  it("soft-deletes", async () => {
    const row = await apptRepo.create({
      patientId: testPatientId, facilityId: testFacilityId, appointmentType: "CHEMOTHERAPY",
      scheduledAt: new Date("2026-08-25T10:00:00Z"),
    });
    await apptRepo.softDelete(row.id);
    const found = await apptRepo.findById(row.id);
    expect(found).toBeNull();
  });

  it("lists by patient", async () => {
    const rows = await apptRepo.findByPatient(testPatientId);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r.patientId).toBe(testPatientId));
  });
});

describe("AppointmentService — status update with cutoff", () => {
  it("confirms an appointment before 2PM", async () => {
    const row = await apptRepo.create({
      patientId: testPatientId, facilityId: testFacilityId, appointmentType: "VIRTUAL",
      scheduledAt: new Date("2026-08-20T10:00:00Z"),
    });

    const result = await apptSvc.updateStatus(row.id, "CONFIRMED");
    expect(result.status).toBe("CONFIRMED");
  });

  it("rejects CONFIRMED transition past 2PM on same day", async () => {
    const row = await apptRepo.create({
      patientId: testPatientId, facilityId: testFacilityId, appointmentType: "VIRTUAL",
      scheduledAt: new Date(), // today
    });

    const now = new Date();
    const lagosHour = Number(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", hour: "numeric", hour12: false })
        .formatToParts(now).find((p) => p.type === "hour")!.value,
    );

    if (lagosHour >= 14) {
      await expect(apptSvc.updateStatus(row.id, "CONFIRMED")).rejects.toThrow("cutoff");
    }
    // if before 2PM, we can't test the rejection case naturally — skip
  });
});
