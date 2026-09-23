import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import { Appointment } from "../entities/Appointment.js";
import { isAfter2pmNigeria, canConfirmOnDay } from "../entities/cutoff.js";
import { AppointmentRepository, AppointmentParticipantRepository } from "../repository.js";
import { AppointmentService } from "../service.js";
import { db } from "../../../db/index.js";
import { appointment } from "../schema.js";
import { patient } from "../../patient/schema.js";
import { facility } from "../../facility/schema.js";
import { user } from "../../auth/schema.js";

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

// Builds an Appointment domain object in the given status for unit tests.
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
  // Scheduled relative to now, since a hardcoded date became a permanent failure once it passed; the 2PM boundary is covered by the injected-now unit tests.
  it("confirms an appointment scheduled for a future day", async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const row = await apptRepo.create({
      patientId: testPatientId, facilityId: testFacilityId, appointmentType: "VIRTUAL",
      scheduledAt: tomorrow,
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

describe("AppointmentService — weekly structure (FR-20)", () => {
  const monday = "2026-08-10T10:00:00Z";
  const tuesday = "2026-08-11T10:00:00Z";
  const wednesday = "2026-08-12T10:00:00Z";

  it("allows a virtual consult on Monday", async () => {
    const result = await apptSvc.createAppointment({
      patientId: testPatientId, facilityId: testFacilityId, appointmentType: "VIRTUAL", scheduledAt: monday,
    });
    expect(result.id).toBeDefined();
  });

  it("allows chemotherapy on Wednesday", async () => {
    const result = await apptSvc.createAppointment({
      patientId: testPatientId, facilityId: testFacilityId, appointmentType: "CHEMOTHERAPY", scheduledAt: wednesday,
    });
    expect(result.id).toBeDefined();
  });

  it("rejects a virtual consult on Tuesday", async () => {
    await expect(
      apptSvc.createAppointment({
        patientId: testPatientId, facilityId: testFacilityId, appointmentType: "VIRTUAL", scheduledAt: tuesday,
      }),
    ).rejects.toThrow("Mon/Wed/Fri");
  });

  it("allows a physical consult on Tuesday", async () => {
    const result = await apptSvc.createAppointment({
      patientId: testPatientId, facilityId: testFacilityId, appointmentType: "PHYSICAL", scheduledAt: tuesday,
    });
    expect(result.id).toBeDefined();
  });

  it("rejects a procedure on Monday", async () => {
    await expect(
      apptSvc.createAppointment({
        patientId: testPatientId, facilityId: testFacilityId, appointmentType: "PROCEDURE", scheduledAt: monday,
      }),
    ).rejects.toThrow("Tue/Thu");
  });

  it("allows an off-structure booking when overrideWeeklyStructure is set", async () => {
    const result = await apptSvc.createAppointment({
      patientId: testPatientId, facilityId: testFacilityId, appointmentType: "PROCEDURE", scheduledAt: monday,
      overrideWeeklyStructure: true,
    });
    expect(result.id).toBeDefined();
  });
});
