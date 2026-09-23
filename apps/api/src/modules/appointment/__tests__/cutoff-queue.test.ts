import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { patient, wallet } from "../../patient/schema.js";
import { serviceClassification, tariff, invoice } from "../../billing/schema.js";
import { appointment } from "../schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";
import { nextWorkingDayFor } from "../entities/next-working-day.js";
import { AppointmentService } from "../service.js";
import { AppointmentRepository } from "../repository.js";
import type { appointmentTypeEnum } from "../../../db/enums.js";
import { InvoiceService } from "../../billing/service.js";
import { PaymentService } from "../../billing/services/PaymentService.js";

const app = createApp();
const apptSvc = new AppointmentService();
const apptRepo = new AppointmentRepository();
const invoiceSvc = new InvoiceService();
const paymentSvc = new PaymentService();

// Fixed reference week, Lagos-anchored (+01:00), so tests don't depend on the runner's timezone.
const MON = "2026-01-05T09:00:00+01:00";
const TUE = "2026-01-06T09:00:00+01:00";
const FRI = "2026-01-09T09:00:00+01:00";

describe("nextWorkingDayFor", () => {
  it("CHEMOTHERAPY (Mon/Wed/Fri) scheduled Monday rolls forward to Wednesday", () => {
    const next = nextWorkingDayFor("CHEMOTHERAPY", new Date(MON), new Date(MON));
    expect(next.toISOString().slice(0, 10)).toBe("2026-01-07");
  });

  it("PROCEDURE (Tue/Thu) scheduled Tuesday rolls forward to Thursday", () => {
    const next = nextWorkingDayFor("PROCEDURE", new Date(TUE), new Date(TUE));
    expect(next.toISOString().slice(0, 10)).toBe("2026-01-08");
  });

  it("CHEMOTHERAPY scheduled Friday skips the weekend to the following Monday", () => {
    const next = nextWorkingDayFor("CHEMOTHERAPY", new Date(FRI), new Date(FRI));
    expect(next.toISOString().slice(0, 10)).toBe("2026-01-12");
  });

  it("preserves the original time-of-day when rolling forward", () => {
    const next = nextWorkingDayFor("CHEMOTHERAPY", new Date(MON), new Date(MON));
    expect(next.getUTCHours()).toBe(new Date(MON).getUTCHours());
  });
});

let testFacilityId: string;
let testPatientId: string;
let classId: string;
let regionalAdminCookie: string;

// Creates a user and returns a valid session cookie for requests.
async function createSessionCookie(): Promise<{ userId: string; cookie: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, email: `cutoff-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

beforeAll(async () => {
  await seedIdentity();

  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: "Cutoff Test Facility", region: "Lagos", address: "C St", status: "ACTIVE",
  }).returning();
  testFacilityId = facRows[0]!.id;

  const patRows = await db.insert(patient).values({
    id: crypto.randomUUID(), uniquePatientId: "CUT-TEST-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
    firstName: "Cutoff", lastName: "Test", dob: "1990-01-01", gender: "Male",
    phone: "+2348011112223", email: "cutoff." + crypto.randomUUID().slice(0, 4) + "@test.com",
    facilityId: testFacilityId, status: "ACTIVE",
  }).returning();
  testPatientId = patRows[0]!.id;

  await db.insert(wallet).values({ id: crypto.randomUUID(), patientId: testPatientId, balanceKobo: 100000000n });

  const classRows = await db.select().from(serviceClassification).where(eq(serviceClassification.name, "CONSULTATION")).limit(1);
  classId = classRows[0]!.id;

  await db.insert(tariff).values({
    id: crypto.randomUUID(), facilityId: testFacilityId, classificationId: classId,
    networkFeeKobo: 100000n, facilityBedFeeKobo: 0n, professionalFeeKobo: 0n, drugPriceKobo: 0n,
  }).onConflictDoNothing();

  const admin = await createSessionCookie();
  regionalAdminCookie = admin.cookie;
  const adminRoleRow = await db.select().from(role).where(eq(role.name, "REGIONAL_ADMIN")).limit(1);
  await db.insert(userRole).values({ userId: admin.userId, roleId: adminRoleRow[0]!.id });
});

// Inserts a PENDING appointment at the given time for the queue tests.
async function createPendingAppointment(
  scheduledAt: Date,
  appointmentType: (typeof appointmentTypeEnum.enumValues)[number] = "VIRTUAL",
) {
  const row = await apptRepo.create({
    patientId: testPatientId, facilityId: testFacilityId, appointmentType, scheduledAt, oncologistId: null,
  });
  return row.id;
}

describe("AppointmentService.handlePaymentEvent", () => {
  it("before 2PM Lagos: leaves the appointment PENDING and unmoved", async () => {
    const scheduledAt = new Date("2026-01-05T10:00:00+01:00");
    const apptId = await createPendingAppointment(scheduledAt, "VIRTUAL");

    await apptSvc.handlePaymentEvent(apptId, new Date("2026-01-05T09:00:00+01:00"));

    const row = await apptRepo.findById(apptId);
    expect(row!.status).toBe("PENDING");
    expect(row!.scheduledAt.toISOString()).toBe(scheduledAt.toISOString());
  });

  it("at/after 2PM Lagos: reschedules to the next FR-20-valid working day, stays PENDING", async () => {
    // Monday is already a valid VIRTUAL day: same-day payment after the 3pm cutoff should roll to Wednesday.
    const scheduledAt = new Date(MON);
    const apptId = await createPendingAppointment(scheduledAt, "VIRTUAL");

    await apptSvc.handlePaymentEvent(apptId, new Date("2026-01-05T15:00:00+01:00"));

    const row = await apptRepo.findById(apptId);
    expect(row!.status).toBe("PENDING");
    expect(row!.scheduledAt.toISOString().slice(0, 10)).toBe("2026-01-07");
  });

  it("is a no-op for an appointment that's already left PENDING", async () => {
    const scheduledAt = new Date("2026-01-06T10:00:00+01:00");
    const apptId = await createPendingAppointment(scheduledAt, "PHYSICAL");
    await apptRepo.update(apptId, { status: "CONFIRMED" });

    await apptSvc.handlePaymentEvent(apptId, new Date("2026-01-06T15:00:00+01:00"));

    const row = await apptRepo.findById(apptId);
    expect(row!.status).toBe("CONFIRMED");
    expect(row!.scheduledAt.toISOString()).toBe(scheduledAt.toISOString());
  });
});

describe("PaymentService.payInvoiceWithWallet — appointment hook integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls AppointmentService.handlePaymentEvent with the invoice's appointmentId on payment", async () => {
    // Tests the wiring only (paying triggers the hook) with a spy, since fake timers stall postgres.js's internal timers.
    const scheduledAt = new Date(TUE);
    const apptId = await createPendingAppointment(scheduledAt, "PHYSICAL");

    const created = await invoiceSvc.createInvoice({
      patientId: testPatientId, facilityId: testFacilityId, classificationId: classId, appointmentId: apptId,
    });
    await invoiceSvc.sendInvoice(created.invoiceId);

    const spy = vi.spyOn(AppointmentService.prototype, "handlePaymentEvent").mockResolvedValue(undefined);

    await paymentSvc.payInvoiceWithWallet(created.invoiceId);

    expect(spy).toHaveBeenCalledWith(apptId, expect.any(Date));
  });

  it("does not touch appointments for a non-appointment-linked invoice", async () => {
    const created = await invoiceSvc.createInvoice({
      patientId: testPatientId, facilityId: testFacilityId, classificationId: classId,
    });
    await invoiceSvc.sendInvoice(created.invoiceId);
    const result = await paymentSvc.payInvoiceWithWallet(created.invoiceId);
    expect(result.invoice.status).toBe("PAID");
  });
});

describe("GET /appointments/pending-confirmation-queue", () => {
  it("returns today's PENDING-but-PAID appointments for REGIONAL_ADMIN", async () => {
    // Uses the real current time so it matches the repository's own Lagos-date calculation for "today".
    const now = new Date();
    const apptId = await createPendingAppointment(now, "VIRTUAL");
    const created = await invoiceSvc.createInvoice({
      patientId: testPatientId, facilityId: testFacilityId, classificationId: classId, appointmentId: apptId,
    });
    await invoiceSvc.sendInvoice(created.invoiceId);
    await db.update(invoice).set({ status: "PAID" }).where(eq(invoice.id, created.invoiceId));

    const res = await request(app).get("/appointments/pending-confirmation-queue").set("Cookie", regionalAdminCookie);
    expect(res.status).toBe(200);
    expect(res.body.appointments.some((a: { id: string }) => a.id === apptId)).toBe(true);
  });
});
