import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole } from "../../auth/schema.js";
import { patient } from "../../patient/schema.js";
import { regimen, regimenCycle } from "../../clinical-metrics/schema.js";
import { file } from "../../documents/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();

let facilityId: string;
let nurse: { id: string; cookie: string };
let otherNurse: { id: string; cookie: string };
let qa: { id: string; email: string; cookie: string };

// Creates a user with the given role and facility, returning a valid session cookie.
async function createUser(roleName: string, facilityId_: string | null = null): Promise<{ id: string; email: string; cookie: string }> {
  const id = crypto.randomUUID();
  const email = `nursing-${crypto.randomUUID()}@test.com`;
  await db.insert(user).values({ id, email, passwordHash: "test", facilityId: facilityId_ });
  const roleRow = await db.select().from(role).where(eq(role.name, roleName as never)).limit(1);
  await db.insert(userRole).values({ userId: id, roleId: roleRow[0]!.id });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId: id, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { id, email, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

// Creates a patient with one SCHEDULED regimen cycle and returns { patientId, cycleId }.
async function createPatientAndCycle(): Promise<{ patientId: string; cycleId: string }> {
  const patientId = crypto.randomUUID();
  await db.insert(patient).values({
    id: patientId, uniquePatientId: "NT-" + crypto.randomUUID().slice(0, 8).toUpperCase(), firstName: "Nursing", lastName: "Test",
    dob: "1980-01-01", gender: "Female", phone: "+2348012340002", email: `nt.${crypto.randomUUID().slice(0, 6)}@example.com`,
    facilityId, status: "ACTIVE",
  });
  const regimenId = crypto.randomUUID();
  await db.insert(regimen).values({
    id: regimenId, patientId, drugName: "Test", protocolCode: "T-1", diagnosis: "Breast cancer, stage II",
    totalCycles: 4, cycleIntervalDays: 21, startedAt: new Date(),
  });
  const cycleId = crypto.randomUUID();
  await db.insert(regimenCycle).values({ id: cycleId, regimenId, cycleNumber: 3, scheduledDate: new Date().toISOString().slice(0, 10) });
  return { patientId, cycleId };
}

// Inserts a CLEAN file row uploaded by the given user and returns its id.
async function createCleanFile(uploadedBy: string, patientId: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(file).values({
    id, patientId, uploadedBy, storageKey: `test/${id}`, mimeType: "image/png",
    virusScanStatus: "CLEAN", fileHash: crypto.randomUUID(),
  });
  return id;
}

// Starts a case for the nurse against a fresh patient/cycle, returning the case id and patient id.
// By default also confirms identity, which documentation submission requires.
async function startCase(verified = true): Promise<{ caseId: string; patientId: string; cycleId: string }> {
  const { patientId, cycleId } = await createPatientAndCycle();
  const res = await request(app).post("/nursing-cases").set("Cookie", nurse.cookie).send({ patientId, regimenCycleId: cycleId });
  expect(res.status).toBe(201);
  if (verified) {
    const v = await request(app).post(`/nursing-cases/${res.body.case.id}/verify-identity`).set("Cookie", nurse.cookie);
    expect(v.status).toBe(200);
    await recordMetrics(nurse.cookie, patientId, cycleId);
  }
  return { caseId: res.body.case.id, patientId, cycleId };
}

const today = () => new Date().toISOString().slice(0, 10);

// Records the biometrics + lab snapshot documentation now requires (as the nurse, against the case's cycle).
async function recordMetrics(cookie: string, patientId: string, cycleId: string) {
  const res = await request(app).post("/clinical-metrics").set("Cookie", cookie).send({
    patientId, regimenCycleId: cycleId, weightKg: 60, heightCm: 160, ageYears: 40, sex: "FEMALE",
    labValues: [{ analyteCode: "CREATININE", value: 70, unit: "µmol/L" }],
  });
  expect(res.status).toBe(201);
}

// Submits the documentation sheet with the required treatment date filled in unless overridden.
function postSheet(cookie: string, caseId: string, body: Record<string, unknown> = {}) {
  return request(app).post(`/nursing-cases/${caseId}/documentation-sheet`).set("Cookie", cookie).send({ treatmentDate: today(), ...body });
}

beforeAll(async () => {
  await seedIdentity();
  const facRows = await db.insert(facility).values({
    id: crypto.randomUUID(), name: `Nursing Doc Facility ${crypto.randomUUID().slice(0, 6)}`, region: "Nursing Doc Region", address: "ND St", status: "ACTIVE",
  }).returning();
  facilityId = facRows[0]!.id;
  nurse = await createUser("ONSITE_NURSING_OFFICER", facilityId);
  otherNurse = await createUser("ONSITE_NURSING_OFFICER", facilityId);
  // Facility-scoped like the nurse: managingConsultant is now resolved from the patient's facility's QA
  // officer, so a QA user with no facility would leave every submission's managingConsultant null.
  qa = await createUser("QUALITY_ASSURANCE_OFFICER", facilityId);
});

describe("documentation sheet submission", () => {
  it("accepts the structured form fields and moves the case to PENDING_QA_REVIEW", async () => {
    const { caseId, patientId } = await startCase();
    // Infusion times come from the live buttons, not the form.
    expect((await request(app).post(`/nursing-cases/${caseId}/infusion/start`).set("Cookie", nurse.cookie)).status).toBe(200);
    expect((await request(app).post(`/nursing-cases/${caseId}/infusion/end`).set("Cookie", nurse.cookie)).status).toBe(200);

    const res = await postSheet(nurse.cookie, caseId, {
      treatmentDate: new Date().toISOString().slice(0, 10),
      note: "Tolerated well, no adverse reaction.",
      nextAppointmentDate: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
    });
    expect(res.status).toBe(201);
    expect(res.body.case.status).toBe("PENDING_QA_REVIEW");
    // diagnosis comes from the cycle's regimen and managingConsultant from the facility's QA officer —
    // qa has no firstName/lastName in this fixture, so it falls back to the email's local part.
    expect(res.body.documentationSheet).toMatchObject({
      diagnosis: "Breast cancer, stage II", managingConsultant: qa.email.split("@")[0],
    });
    expect(res.body.documentationSheet.infusionStartTime).toMatch(/^\d{2}:\d{2}/);
    expect(res.body.documentationSheet.infusionEndTime).toMatch(/^\d{2}:\d{2}/);
    expect(res.body.documentationSheet.fileReference).toBeNull();

    const fetched = await request(app).get(`/nursing-cases/${caseId}`).set("Cookie", nurse.cookie);
    expect(fetched.body.case.cycleNumber).toBe(3);
    expect(fetched.body.case.documentationSheet.diagnosis).toBe("Breast cancer, stage II");
  });

  it("ignores client-supplied diagnosis/managingConsultant and resolves both server-side", async () => {
    const { caseId, patientId } = await startCase();
        const res = await postSheet(nurse.cookie, caseId, {
      // A client can still send these (an older build might); the server must not trust either.
      diagnosis: "Made up diagnosis", managingConsultant: "Dr. Someone Made Up",
    });
    expect(res.status).toBe(201);
    expect(res.body.documentationSheet.diagnosis).toBe("Breast cancer, stage II");
    expect(res.body.documentationSheet.managingConsultant).toBe(qa.email.split("@")[0]);
  });

  it("leaves managingConsultant null when the patient's facility has no QA officer on record", async () => {
    const facRows = await db.insert(facility).values({
      id: crypto.randomUUID(), name: `No-QA Facility ${crypto.randomUUID().slice(0, 6)}`, region: "Nursing Doc Region", address: "ND St", status: "ACTIVE",
    }).returning();
    const orphanNurse = await createUser("ONSITE_NURSING_OFFICER", facRows[0]!.id);
    const { patientId, cycleId } = await createPatientAndCycle();
    // createPatientAndCycle always uses the shared facilityId; re-point this patient at the QA-less facility.
    await db.update(patient).set({ facilityId: facRows[0]!.id }).where(eq(patient.id, patientId));
    const started = await request(app).post("/nursing-cases").set("Cookie", orphanNurse.cookie).send({ patientId, regimenCycleId: cycleId });
    await request(app).post(`/nursing-cases/${started.body.case.id}/verify-identity`).set("Cookie", orphanNurse.cookie);
    await recordMetrics(orphanNurse.cookie, patientId, cycleId);

    const res = await postSheet(orphanNurse.cookie, started.body.case.id, {
      });
    expect(res.status).toBe(201);
    expect(res.body.documentationSheet.managingConsultant).toBeNull();
  });

  it("notifies every QA Officer once the case is submitted", async () => {
    const { caseId, patientId } = await startCase();
        const before = await request(app).get("/notifications").set("Cookie", qa.cookie);
    const beforeCount = before.body.notifications.filter((n: { type: string }) => n.type === "NURSING_CASE_SUBMITTED").length;

    await postSheet(nurse.cookie, caseId, {
      });

    const after = await request(app).get("/notifications").set("Cookie", qa.cookie);
    const afterCount = after.body.notifications.filter((n: { type: string }) => n.type === "NURSING_CASE_SUBMITTED").length;
    expect(afterCount).toBe(beforeCount + 1);
  });

  it("refuses to document another nurse's case", async () => {
    const { caseId, patientId } = await startCase();
        const res = await postSheet(otherNurse.cookie, caseId, {
      });
    expect(res.status).toBe(403);
  });

  it("refuses documentation until identity has been verified, and only the case owner can verify", async () => {
    const { caseId, patientId, cycleId } = await startCase(false);
    const early = await postSheet(nurse.cookie, caseId, {});
    expect(early.status).toBe(409);

    const stranger = await request(app).post(`/nursing-cases/${caseId}/verify-identity`).set("Cookie", otherNurse.cookie);
    expect(stranger.status).toBe(403);

    const verified = await request(app).post(`/nursing-cases/${caseId}/verify-identity`).set("Cookie", nurse.cookie);
    expect(verified.status).toBe(200);
    // Idempotent: resuming later must not restamp or fail, and the case reads back as verified.
    const again = await request(app).post(`/nursing-cases/${caseId}/verify-identity`).set("Cookie", nurse.cookie);
    expect(again.body.case.identityVerifiedAt).toBe(verified.body.case.identityVerifiedAt);
    const fetched = await request(app).get(`/nursing-cases/${caseId}`).set("Cookie", nurse.cookie);
    expect(fetched.body.case.identityVerifiedAt).not.toBeNull();

    await recordMetrics(nurse.cookie, patientId, cycleId);
    const ok = await postSheet(nurse.cookie, caseId, {});
    expect(ok.status).toBe(201);
    // The UPI is the patient's own, filled server-side rather than typed.
    expect(ok.body.documentationSheet.upiCodeEntered).toMatch(/^NT-/);
    expect(ok.body.documentationSheet.idPhotoFileId).toBeNull();
  });

  it("completes the cycle when QA closes the case, so it leaves the due list", async () => {
    const { caseId, cycleId, patientId } = await startCase();
    const due = async () => (await request(app).get(`/regimen-cycles?facilityId=${facilityId}&date=${new Date().toISOString().slice(0, 10)}&due=true`).set("Cookie", nurse.cookie)).body.cycles as { id: string; caseStatus: string | null; lastReviewDecision: string | null }[];

    expect((await due()).find((c) => c.id === cycleId)).toMatchObject({ caseStatus: "STARTED" });
    await postSheet(nurse.cookie, caseId, {});
    expect((await due()).find((c) => c.id === cycleId)).toMatchObject({ caseStatus: "PENDING_QA_REVIEW" });

    await request(app).post(`/nursing-cases/${caseId}/review`).set("Cookie", qa.cookie).send({ decision: "REQUIREMENTS_INCOMPLETE", reason: "Fix it" });
    expect((await due()).find((c) => c.id === cycleId)).toMatchObject({ caseStatus: "PENDING_QA_REVIEW", lastReviewDecision: "REQUIREMENTS_INCOMPLETE" });

    await recordMetrics(nurse.cookie, patientId, cycleId);
    await postSheet(nurse.cookie, caseId, {});
    await request(app).post(`/nursing-cases/${caseId}/review`).set("Cookie", qa.cookie).send({ decision: "REQUIREMENTS_MET" });
    expect((await due()).find((c) => c.id === cycleId)).toBeUndefined();
  });
});

describe("server-side completeness and write guards", () => {
  it("refuses a sheet without biometrics/labs, a treatment date, or with an infusion still running", async () => {
    const { caseId, patientId, cycleId } = await startCase(false);
    await request(app).post(`/nursing-cases/${caseId}/verify-identity`).set("Cookie", nurse.cookie);

    const noMetrics = await postSheet(nurse.cookie, caseId);
    expect(noMetrics.status).toBe(409);
    expect(noMetrics.body.error).toContain("weight, height and creatinine");

    await recordMetrics(nurse.cookie, patientId, cycleId);
    const noDate = await request(app).post(`/nursing-cases/${caseId}/documentation-sheet`).set("Cookie", nurse.cookie).send({});
    expect(noDate.status).toBe(400);
    // A started-but-unfinished infusion blocks submission; ending it unblocks.
    await request(app).post(`/nursing-cases/${caseId}/infusion/start`).set("Cookie", nurse.cookie);
    const running = await postSheet(nurse.cookie, caseId);
    expect(running.status).toBe(409);
    expect(running.body.error).toContain("End the infusion");
    await request(app).post(`/nursing-cases/${caseId}/infusion/end`).set("Cookie", nurse.cookie);
    expect((await postSheet(nurse.cookie, caseId)).status).toBe(201);
  });

  it("rejects implausible or incomplete biometrics/labs", async () => {
    const { patientId, cycleId } = await startCase(false);
    const post = (over: Record<string, unknown>) => request(app).post("/clinical-metrics").set("Cookie", nurse.cookie).send({
      patientId, regimenCycleId: cycleId, weightKg: 60, heightCm: 160, ageYears: 40, sex: "FEMALE",
      labValues: [{ analyteCode: "CREATININE", value: 70, unit: "µmol/L" }], ...over,
    });
    expect((await post({ weightKg: 0 })).status).toBe(400);
    expect((await post({ heightCm: 5 })).status).toBe(400);
    expect((await post({ labValues: [{ analyteCode: "UREA", value: 5, unit: "mmol/L" }] })).status).toBe(400);
    expect((await post({ labValues: [{ analyteCode: "CREATININE", value: 0, unit: "µmol/L" }] })).status).toBe(400);
    expect((await post({})).status).toBe(201);
  });

  it("ties a nurse's vitals to their own editable case", async () => {
    const { caseId, patientId } = await startCase();
    const vital = (cookie: string, over: Record<string, unknown> = {}) => request(app).post("/vitals").set("Cookie", cookie).send({
      patientId, vitalType: "HEART_RATE_BPM", value: 72, source: "MANUAL_ENTRY", nursingCaseId: caseId, ...over,
    });
    expect((await vital(nurse.cookie, { nursingCaseId: undefined })).status).toBe(400);
    expect((await vital(otherNurse.cookie)).status).toBe(403);
    expect((await vital(nurse.cookie, { patientId: (await createPatientAndCycle()).patientId })).status).toBe(400);
    expect((await vital(nurse.cookie)).status).toBe(201);

    await postSheet(nurse.cookie, caseId);
    expect((await vital(nurse.cookie)).status).toBe(409);
  });

  it("records an identity mismatch report, tells Regional Admin, and only the owner can report", async () => {
    const { caseId } = await startCase(false);
    expect((await request(app).post(`/nursing-cases/${caseId}/report-mismatch`).set("Cookie", otherNurse.cookie).send({})).status).toBe(403);
    const res = await request(app).post(`/nursing-cases/${caseId}/report-mismatch`).set("Cookie", nurse.cookie).send({ note: "Photo is a different person" });
    expect(res.status).toBe(201);
    expect(res.body.report).toMatchObject({ nursingCaseId: caseId, reportedBy: nurse.id, note: "Photo is a different person" });
  });
});

describe("QA facility scoping", () => {
  it("shows a QA officer only their own facility's cases, queue and history", async () => {
    const { caseId, patientId } = await startCase();
    await postSheet(nurse.cookie, caseId);

    const otherFacility = (await db.insert(facility).values({
      id: crypto.randomUUID(), name: `Other QA Facility ${crypto.randomUUID().slice(0, 6)}`, region: "Nursing Doc Region", address: "OQ St", status: "ACTIVE",
    }).returning())[0]!.id;
    const outsideQa = await createUser("QUALITY_ASSURANCE_OFFICER", otherFacility);

    const queue = await request(app).get("/nursing-cases/pending-review").set("Cookie", outsideQa.cookie);
    expect(queue.body.cases.some((c: { id: string }) => c.id === caseId)).toBe(false);
    expect((await request(app).get(`/nursing-cases/${caseId}`).set("Cookie", outsideQa.cookie)).status).toBe(403);
    expect((await request(app).get(`/nursing-cases?patientId=${patientId}`).set("Cookie", outsideQa.cookie)).status).toBe(403);
    expect((await request(app).get(`/drug-usage?nursingCaseId=${caseId}`).set("Cookie", outsideQa.cookie)).status).toBe(403);
    expect((await request(app).post(`/nursing-cases/${caseId}/review`).set("Cookie", outsideQa.cookie).send({ decision: "REQUIREMENTS_MET" })).status).toBe(403);

    // Their own facility's QA still can, and is the one notified.
    const inQueue = await request(app).get("/nursing-cases/pending-review").set("Cookie", qa.cookie);
    expect(inQueue.body.cases.some((c: { id: string }) => c.id === caseId)).toBe(true);
    const outsideNotes = await request(app).get("/notifications").set("Cookie", outsideQa.cookie);
    expect(outsideNotes.body.notifications.filter((n: { type: string }) => n.type === "NURSING_CASE_SUBMITTED")).toHaveLength(0);
  });
});

describe("QA review and resubmission", () => {
  it("requires a reason for REQUIREMENTS_INCOMPLETE, lets the nurse amend and resubmit, then closes on REQUIREMENTS_MET", async () => {
    const { caseId, patientId, cycleId } = await startCase();
    const submit = await postSheet(nurse.cookie, caseId, {
      note: "First pass",
    });
    const sheetId = submit.body.documentationSheet.id;

    const noReason = await request(app).post(`/nursing-cases/${caseId}/review`).set("Cookie", qa.cookie).send({ decision: "REQUIREMENTS_INCOMPLETE" });
    expect(noReason.status).toBe(409);

    const rejected = await request(app).post(`/nursing-cases/${caseId}/review`).set("Cookie", qa.cookie).send({
      decision: "REQUIREMENTS_INCOMPLETE", reason: "Missing infusion times",
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.case.status).toBe("PENDING_QA_REVIEW");

    // Resubmission needs fresh biometrics/labs (the earlier ones predate QA's review), and updates the same sheet.
    const stale = await postSheet(nurse.cookie, caseId, { note: "too soon" });
    expect(stale.status).toBe(409);
    await recordMetrics(nurse.cookie, patientId, cycleId);
    const resubmit = await postSheet(nurse.cookie, caseId, {
      note: "Second pass",
    });
    expect(resubmit.status).toBe(201);
    expect(resubmit.body.documentationSheet.id).toBe(sheetId);
    expect(resubmit.body.documentationSheet.note).toBe("Second pass");

    const closed = await request(app).post(`/nursing-cases/${caseId}/review`).set("Cookie", qa.cookie).send({ decision: "REQUIREMENTS_MET" });
    expect(closed.status).toBe(200);
    expect(closed.body.case.status).toBe("CLOSED");

    const afterClose = await postSheet(nurse.cookie, caseId, {
      });
    expect(afterClose.status).toBe(409);
  });

  it("freezes every change while pending QA review, unfreezes when QA sends it back, and refreezes on resubmission", async () => {
    const { caseId, patientId, cycleId } = await startCase();
    const submit = () => postSheet(nurse.cookie, caseId, { note: "n" });
    const caseView = async () => (await request(app).get(`/nursing-cases/${caseId}`).set("Cookie", nurse.cookie)).body.case;
    const metrics = () => request(app).post("/clinical-metrics").set("Cookie", nurse.cookie).send({
      patientId, regimenCycleId: cycleId, weightKg: 60, heightCm: 160, ageYears: 40, sex: "FEMALE",
      labValues: [{ analyteCode: "CREATININE", value: 70, unit: "µmol/L" }],
    });
    const verify = () => request(app).post(`/nursing-cases/${caseId}/verify-identity`).set("Cookie", nurse.cookie);

    expect((await caseView()).editable).toBe(true);
    expect((await submit()).status).toBe(201);

    // Submitted: nothing moves.
    expect((await caseView()).editable).toBe(false);
    expect((await submit()).status).toBe(409);
    expect((await metrics()).status).toBe(409);
    expect((await verify()).status).toBe(409);

    // Sent back: editable again.
    await request(app).post(`/nursing-cases/${caseId}/review`).set("Cookie", qa.cookie).send({ decision: "REQUIREMENTS_INCOMPLETE", reason: "Fix" });
    expect((await caseView()).editable).toBe(true);
    expect((await metrics()).status).toBe(201);
    expect((await submit()).status).toBe(201);

    // Resubmitted: frozen again until QA acts.
    expect((await caseView()).editable).toBe(false);
    expect((await submit()).status).toBe(409);
  });

  it("notifies the nurse when their case is reviewed", async () => {
    const { caseId, patientId } = await startCase();
        await postSheet(nurse.cookie, caseId, {});

    const before = await request(app).get("/notifications").set("Cookie", nurse.cookie);
    const beforeCount = before.body.notifications.filter((n: { type: string }) => n.type === "NURSING_CASE_REVIEWED").length;

    await request(app).post(`/nursing-cases/${caseId}/review`).set("Cookie", qa.cookie).send({ decision: "REQUIREMENTS_MET" });

    const after = await request(app).get("/notifications").set("Cookie", nurse.cookie);
    const afterCount = after.body.notifications.filter((n: { type: string }) => n.type === "NURSING_CASE_REVIEWED").length;
    expect(afterCount).toBe(beforeCount + 1);
  });

  it("shows the pending queue with patient and cycle context", async () => {
    const { caseId, patientId } = await startCase();
        await postSheet(nurse.cookie, caseId, {});

    const pending = await request(app).get("/nursing-cases/pending-review").set("Cookie", qa.cookie);
    expect(pending.status).toBe(200);
    const row = pending.body.cases.find((c: { id: string }) => c.id === caseId);
    expect(row).toMatchObject({ cycleNumber: 3, startedBy: nurse.id, patientFirstName: "Nursing" });
    expect(row.startedByEmail).toContain("nursing-");

    const nurseAttempt = await request(app).get("/nursing-cases/pending-review").set("Cookie", nurse.cookie);
    expect(nurseAttempt.status).toBe(403);
  });
});

describe("drug usage visibility for review", () => {
  it("lets QA read usage logged against a case they don't own, but not an unrelated nurse", async () => {
    const { caseId, patientId } = await startCase();
        await postSheet(nurse.cookie, caseId, {});

    const qaRead = await request(app).get(`/drug-usage?nursingCaseId=${caseId}`).set("Cookie", qa.cookie);
    expect(qaRead.status).toBe(200);

    const strangerRead = await request(app).get(`/drug-usage?nursingCaseId=${caseId}`).set("Cookie", otherNurse.cookie);
    expect(strangerRead.status).toBe(403);
  });
});

describe("live infusion buttons and the admin live board", () => {
  it("stamps infusion start then end once each, in order, owner only, and only while editable", async () => {
    const { caseId } = await startCase();
    const start = (cookie: string) => request(app).post(`/nursing-cases/${caseId}/infusion/start`).set("Cookie", cookie);
    const end = (cookie: string) => request(app).post(`/nursing-cases/${caseId}/infusion/end`).set("Cookie", cookie);

    expect((await end(nurse.cookie)).status).toBe(409); // can't end before starting
    expect((await start(otherNurse.cookie)).status).toBe(403);
    const started = await start(nurse.cookie);
    expect(started.status).toBe(200);
    expect(started.body.case.infusionStartedAt).toBeTruthy();
    expect((await start(nurse.cookie)).status).toBe(409); // no restart / back-dating
    // A resumed case reads the stamp back, so the form shows the infusion as already running.
    const reread = await request(app).get(`/nursing-cases/${caseId}`).set("Cookie", nurse.cookie);
    expect(reread.body.case.infusionStartedAt).toBeTruthy();
    expect((await end(nurse.cookie)).status).toBe(200);
    expect((await end(nurse.cookie)).status).toBe(409);

    await postSheet(nurse.cookie, caseId);
    expect((await start(nurse.cookie)).status).toBe(409); // frozen once submitted
  });

  it("refuses to start the infusion before identity is verified", async () => {
    const { caseId } = await startCase(false);
    const res = await request(app).post(`/nursing-cases/${caseId}/infusion/start`).set("Cookie", nurse.cookie);
    expect(res.status).toBe(409);
  });

  it("shows Regional Admin the live stage and milestone timeline of cases in their region only", async () => {
    const admin = await createUser("REGIONAL_ADMIN", facilityId);
    const { caseId } = await startCase();
    const board = async () => (await request(app).get("/nursing-cases/live").set("Cookie", admin.cookie)).body.cases as Array<{ id: string; stage: string; timeline: Array<{ eventType: string }> }>;
    const find = async () => (await board()).find((c) => c.id === caseId);

    expect((await find())?.stage).toBe("IDENTITY_VERIFIED");
    await request(app).post(`/nursing-cases/${caseId}/infusion/start`).set("Cookie", nurse.cookie);
    expect((await find())?.stage).toBe("INFUSION_IN_PROGRESS");
    await request(app).post(`/nursing-cases/${caseId}/infusion/end`).set("Cookie", nurse.cookie);
    expect((await find())?.stage).toBe("INFUSION_COMPLETED");
    await postSheet(nurse.cookie, caseId);
    expect((await find())?.stage).toBe("AWAITING_QA_REVIEW");
    await request(app).post(`/nursing-cases/${caseId}/review`).set("Cookie", qa.cookie).send({ decision: "REQUIREMENTS_INCOMPLETE", reason: "Fix it" });
    expect((await find())?.stage).toBe("SENT_BACK_BY_QA");
    expect((await find())?.timeline.map((e) => e.eventType)).toEqual([
      "CASE_STARTED", "IDENTITY_VERIFIED", "INFUSION_STARTED", "INFUSION_ENDED", "SUBMITTED_FOR_QA", "SENT_BACK_BY_QA",
    ]);

    // A Regional Admin in another region sees none of it, and a nurse can't read the board at all.
    const otherRegionFacility = (await db.insert(facility).values({
      id: crypto.randomUUID(), name: `Other Region ${crypto.randomUUID().slice(0, 6)}`, region: "Elsewhere Region", address: "X St", status: "ACTIVE",
    }).returning())[0]!;
    const outsider = await createUser("REGIONAL_ADMIN", otherRegionFacility.id);
    const outsiderBoard = await request(app).get("/nursing-cases/live").set("Cookie", outsider.cookie);
    expect(outsiderBoard.body.cases.find((c: { id: string }) => c.id === caseId)).toBeUndefined();
    expect((await request(app).get("/nursing-cases/live").set("Cookie", nurse.cookie)).status).toBe(403);
  });
});
