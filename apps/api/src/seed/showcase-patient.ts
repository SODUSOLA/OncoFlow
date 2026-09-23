import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  patient, user,
  countdownCase, labRequest, labResult, file,
  appointment, meeting,
  notification,
  patientTimeline,
  invoice, walletTransaction, wallet,
} from "../db/schema.js";

// Enriches one demo patient with countdown case, labs, appointments, meeting, notifications and timeline so every patient screen has data; file rows use placeholder storage keys.
const SHOWCASE_PATIENT_EMAIL = "adebayo.ogunlesi@example.com";
const VMO_EMAIL = "chukwuemeka.obi@oncoflow.dev";
const ONCOLOGIST_EMAIL = "adaeze.nwankwo@oncoflow.dev";

// Returns the user id for an email.
async function findUserIdByEmail(email: string): Promise<string> {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (rows.length === 0) throw new Error(`User not found: ${email} — run seedDemoUsers/seedPatients first`);
  return rows[0]!.id;
}

// Seeds the showcase patient's extra records.
export async function seedShowcasePatient() {
  const patientRows = await db.select().from(patient).where(eq(patient.email, SHOWCASE_PATIENT_EMAIL)).limit(1);
  if (patientRows.length === 0) {
    console.log(`Showcase patient ${SHOWCASE_PATIENT_EMAIL} not found, skipping (run seedPatients first)`);
    return;
  }
  const pat = patientRows[0]!;

  const existingCountdown = await db.select().from(countdownCase).where(eq(countdownCase.patientId, pat.id)).limit(1);
  if (existingCountdown.length > 0) {
    console.log("Showcase patient already enriched, skipping");
    return;
  }
  if (!pat.userId) {
    console.log("Showcase patient has no linked user account, skipping");
    return;
  }
  const patientUserId = pat.userId;

  const vmoId = await findUserIdByEmail(VMO_EMAIL);
  const oncologistId = await findUserIdByEmail(ONCOLOGIST_EMAIL);

  const now = Date.now();
  // Returns a date the given number of days ago.
  const daysAgo = (n: number) => new Date(now - n * 86_400_000);
  // Returns a date the given number of days ahead.
  const daysFromNow = (n: number) => new Date(now + n * 86_400_000);

  // A countdown case on day 3 with labs already prompted, matching the pending lab request below.
  await db.insert(countdownCase).values({
    id: crypto.randomUUID(),
    patientId: pat.id,
    currentDay: 3,
    status: "ACTIVE",
    labsPromptedAt: daysAgo(1),
  });

  // One pending lab request (drives Records' upload card + Dashboard's inline action)...
  const pendingLabRequestId = crypto.randomUUID();
  await db.insert(labRequest).values({
    id: pendingLabRequestId,
    patientId: pat.id,
    requestedBy: vmoId,
    status: "PENDING",
  });

  // ...and one already reviewed, with a result on file, for Records' history list.
  const reviewedLabRequestId = crypto.randomUUID();
  await db.insert(labRequest).values({
    id: reviewedLabRequestId,
    patientId: pat.id,
    requestedBy: vmoId,
    status: "REVIEWED",
  });
  const labFileId = crypto.randomUUID();
  await db.insert(file).values({
    id: labFileId,
    patientId: pat.id,
    uploadedBy: patientUserId,
    storageKey: `seed-placeholder/lab-results/${pat.id}/cbc-panel.pdf`,
    mimeType: "application/pdf",
    virusScanStatus: "CLEAN",
    fileHash: crypto.createHash("sha256").update(`${pat.id}-cbc-panel`).digest("hex"),
  });
  await db.insert(labResult).values({
    id: crypto.randomUUID(),
    patientId: pat.id,
    requestId: reviewedLabRequestId,
    uploadedBy: patientUserId,
    reviewedBy: oncologistId,
    status: "REVIEWED",
    fileId: labFileId,
    testDate: daysAgo(12).toISOString().slice(0, 10),
    fileHash: crypto.createHash("sha256").update(`${pat.id}-cbc-panel`).digest("hex"),
  });

  // Upcoming virtual consult with a scheduled meeting behind it.
  const upcomingAppointmentId = crypto.randomUUID();
  await db.insert(appointment).values({
    id: upcomingAppointmentId,
    patientId: pat.id,
    oncologistId,
    facilityId: pat.facilityId,
    appointmentType: "VIRTUAL",
    scheduledAt: daysFromNow(2),
    status: "CONFIRMED",
    paymentConfirmedAt: daysAgo(1),
  });
  await db.insert(meeting).values({
    id: crypto.randomUUID(),
    appointmentId: upcomingAppointmentId,
    // Daily isn't configured in dev, so this only exercises the waiting-room UI.
    provider: "daily",
    roomId: `oncoflow-demo-${upcomingAppointmentId.slice(0, 8)}`,
    status: "SCHEDULED",
  });

  // Past physical visit, completed — calendar history + a CONSULTATION timeline entry.
  const pastAppointmentId = crypto.randomUUID();
  await db.insert(appointment).values({
    id: pastAppointmentId,
    patientId: pat.id,
    oncologistId,
    facilityId: pat.facilityId,
    appointmentType: "PHYSICAL",
    scheduledAt: daysAgo(10),
    status: "COMPLETED",
    paymentConfirmedAt: daysAgo(11),
  });

  // One notification of each labeled type, mixed read and unread so the unread badge has a count.
  await db.insert(notification).values([
    { id: crypto.randomUUID(), recipientId: patientUserId, type: "APPOINTMENT_REMINDER", status: "SENT", sentAt: daysAgo(0) },
    { id: crypto.randomUUID(), recipientId: patientUserId, type: "LAB_RESULT_REVIEWED", status: "READ", sentAt: daysAgo(11) },
    { id: crypto.randomUUID(), recipientId: patientUserId, type: "INVOICE_SENT", status: "READ", sentAt: daysAgo(6) },
    { id: crypto.randomUUID(), recipientId: patientUserId, type: "PAYMENT_CONFIRMED", status: "SENT", sentAt: daysAgo(1) },
    { id: crypto.randomUUID(), recipientId: patientUserId, type: "NEW_MESSAGE", status: "PENDING" },
  ]);

  // Rounds out the timeline with real invoice or wallet references, falling back to the patient's own id.
  const [oneInvoice] = await db.select({ id: invoice.id }).from(invoice).where(eq(invoice.patientId, pat.id)).limit(1);
  const [oneWalletTxn] = await db
    .select({ id: walletTransaction.id })
    .from(walletTransaction)
    .innerJoin(wallet, eq(walletTransaction.walletId, wallet.id))
    .where(eq(wallet.patientId, pat.id))
    .limit(1);

  await db.insert(patientTimeline).values([
    { id: crypto.randomUUID(), patientId: pat.id, eventType: "APPOINTMENT", referenceId: pastAppointmentId },
    { id: crypto.randomUUID(), patientId: pat.id, eventType: "CONSULTATION", referenceId: pastAppointmentId },
    { id: crypto.randomUUID(), patientId: pat.id, eventType: "APPOINTMENT", referenceId: upcomingAppointmentId },
    { id: crypto.randomUUID(), patientId: pat.id, eventType: "INVOICE", referenceId: oneInvoice?.id ?? pat.id },
    { id: crypto.randomUUID(), patientId: pat.id, eventType: "WALLET", referenceId: oneWalletTxn?.id ?? pat.id },
    { id: crypto.randomUUID(), patientId: pat.id, eventType: "STATUS_CHANGE", referenceId: pat.id },
  ]);

  console.log(`Enriched showcase patient ${SHOWCASE_PATIENT_EMAIL} (${pat.uniquePatientId}) with countdown case, labs, appointments, notifications, timeline`);
}
