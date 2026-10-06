import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import { role, permission, rolePermission } from "../db/schema.js";

// PATIENT intentionally has no grants: self-service is enforced by ownership checks, and a blanket permission would expose every other patient's data.
const ROLES = [
  "PATIENT",
  "REGIONAL_ADMIN",
  "VIRTUAL_MEDICAL_OFFICER",
  "CONSULTING_ONCOLOGIST",
  "CONSULTING_SURGEON",
  "CONSULTING_NUTRITIONIST",
  "CONSULTING_PSYCHO_ONCOLOGIST",
  "STATE_CLINICAL_DIRECTOR",
  "QUALITY_ASSURANCE_OFFICER",
  "ONSITE_NURSING_OFFICER",
  "NATIONAL_CLINICAL_DIRECTOR",
  "STATE_DIRECTOR_OF_NURSING_SERVICES",
  "NATIONAL_DIRECTOR_OF_NURSING_SERVICES",
  "SCRIBE",
  "SUPER_ADMIN",
] as const;

const PERMISSIONS: { resource: string; action: string; description: string }[] = [
  { resource: "auth", action: "login", description: "Login to the system" },
  { resource: "user", action: "read", description: "Read own user profile" },
  { resource: "user", action: "update", description: "Update own user profile" },
  { resource: "auth", action: "update", description: "Auth session management" },
  { resource: "patient", action: "read", description: "Read patient records" },
  { resource: "patient", action: "create", description: "Register a new patient record and issue a Unique Patient ID (Regional Admin approval of a self-registration)" },
  { resource: "patient", action: "update", description: "Update patient records" },
  { resource: "patient", action: "delete", description: "Delete patient records" },
  { resource: "patient", action: "call", description: "Place a masked call to a patient (Regional Admin / Onsite Nursing Officer only)" },
  { resource: "wallet", action: "read", description: "Read wallet records" },
  { resource: "invoice", action: "create", description: "Create invoices" },
  { resource: "invoice", action: "read", description: "Read invoices" },
  { resource: "invoice", action: "update", description: "Update invoices" },
  { resource: "invoice", action: "send", description: "Send a draft invoice to its patient (Regional Admin, within region)" },
  { resource: "serviceClassification", action: "read", description: "Read service classifications" },
  { resource: "tariff", action: "read", description: "Read per-facility tariff rates (invoice fee-breakdown preview)" },
  { resource: "appointment", action: "create", description: "Create appointments" },
  { resource: "appointment", action: "read", description: "Read appointments" },
  { resource: "appointment", action: "update", description: "Update appointments" },
  { resource: "appointment", action: "delete", description: "Delete appointments" },
  { resource: "appointment", action: "override", description: "Override the fixed weekly schedule structure (FR-20)" },
  { resource: "countdownCase", action: "read", description: "Read countdown cases" },
  { resource: "countdownCase", action: "update", description: "Transition a countdown case (labs prompted/uploaded, results sent to QA, payment confirmed)" },
  { resource: "conversation", action: "create", description: "Start a conversation" },
  { resource: "conversation", action: "read", description: "Read conversations" },
  { resource: "conversation", action: "update", description: "Update/close conversations" },
  { resource: "message", action: "create", description: "Post a message" },
  { resource: "message", action: "read", description: "Read messages" },
  { resource: "publicInquiry", action: "read", description: "Read public (pre-registration) chat-widget inquiries from the marketing site" },
  { resource: "publicInquiry", action: "update", description: "Reply to, link-to-patient, or close a public inquiry" },
  { resource: "triage", action: "create", description: "Start and answer the VMO's mandatory Yes/No triage checklist for an active side-effect chat" },
  { resource: "triage", action: "read", description: "Read the patient folder and medication triage unlocked by a completed checklist (VMO only, chat-scoped)" },
  { resource: "specialistEscalation", action: "create", description: "Escalate a patient to a Specialist Oncologist (VMO)" },
  { resource: "specialistEscalation", action: "read", description: "Read specialist escalations in your region (Regional Admin, Clinical Directors)" },
  { resource: "specialistEscalation", action: "update", description: "Advance a specialist escalation: consult scheduled, resolved (Regional Admin)" },
  { resource: "triageChecklist", action: "create", description: "Complete a triage checklist (Virtual Medical Officer only, requireRole)" },
  { resource: "triageChecklist", action: "read", description: "Read a triage checklist" },
  { resource: "prescription", action: "create", description: "Create a prescription (MO or Consultant)" },
  { resource: "prescription", action: "read", description: "Read prescriptions" },
  { resource: "labRequest", action: "create", description: "Create a lab request" },
  { resource: "labRequest", action: "read", description: "Read lab requests" },
  { resource: "labRequest", action: "update", description: "Transition a lab request's status" },
  { resource: "labResult", action: "create", description: "Upload a lab result" },
  { resource: "labResult", action: "read", description: "Read lab results (Regional Admin gets the scoped view — file/date/duplicate flag only)" },
  { resource: "clinicalDecision", action: "read", description: "Read a clinical decision" },
  { resource: "clinicalDecision", action: "update", description: "Record a QA recommendation or final director decision (role-gated per stage)" },
  { resource: "meeting", action: "create", description: "Provision a video meeting (Daily.co room) for an appointment" },
  { resource: "meeting", action: "read", description: "Read a video meeting's status" },
  { resource: "meeting", action: "update", description: "Sign off on a Scribe-corrected transcript (the appointment's assigned consultant only, ownership-checked — F3.11 stage 2)" },
  { resource: "transcript", action: "read", description: "Read a meeting's transcript" },
  { resource: "transcript", action: "update", description: "Edit a transcript entry (post-hoc correction, Scribe only, requireRole — F3.11)" },
  { resource: "transcriptionAssignment", action: "read", description: "Read the transcription queue / own claimed assignments (F3.11)" },
  { resource: "transcriptionAssignment", action: "claim", description: "Claim an item from the shared transcription queue (Scribe only, requireRole — F3.11)" },
  { resource: "transcriptionAssignment", action: "update", description: "Release or finalize a claimed transcription assignment (Scribe only, requireRole — F3.11)" },
  // One calendar permission for every role since the endpoint resolves scope per caller; only SUPER_ADMIN is granted it for now.
  { resource: "calendar", action: "read", description: "Read the unified calendar (FR-24)" },
  { resource: "staffing", action: "read", description: "Read the facility staffing/shift grid" },
  { resource: "staffing", action: "update", description: "Assign nurses to shifts and publish a week's schedule" },
  { resource: "inventory", action: "read", description: "Read regional drug stock levels and open reconciliation variances" },
  { resource: "inventory", action: "update", description: "Record a purchase/dispatch movement and resolve a reconciliation variance" },
  { resource: "transferRequest", action: "create", description: "Initiate a patient facility transfer request" },
  { resource: "transferRequest", action: "read", description: "Read facility transfer requests" },
  { resource: "audit", action: "read", description: "Read a region-scoped activity feed (logins, logouts, access-denied events) for own facility-scoped staff" },
  // Defines the "file" resource that was never declared, so staff file permissions previously granted nothing.
  { resource: "file", action: "create", description: "Upload a file attached to a patient record (staff uploading on a patient's behalf, e.g. Nursing Officer identity/documentation capture)" },
  { resource: "file", action: "read", description: "Read a file's metadata / fetch its signed download URL" },
  { resource: "clinicalNote", action: "create", description: "Add a free-text clinical note to a patient's medical record" },
  { resource: "clinicalNote", action: "read", description: "Read a patient's clinical notes" },
  { resource: "regimen", action: "read", description: "Read a patient's active treatment regimen and cycles" },
  { resource: "regimen", action: "create", description: "Prescribe a new treatment regimen (drug, protocol, diagnosis, cycles) for a patient" },
  { resource: "vital", action: "read", description: "Read a patient's vital-sign readings" },
  { resource: "vital", action: "create", description: "Record a vital-sign reading (e.g. logged during a video consult)" },
  { resource: "clinicalMetrics", action: "read", description: "Read a patient's current BMI/BSA/CrCl snapshot and FBC/E-U-Cr values" },
  { resource: "clinicalMetrics", action: "create", description: "Record a per-cycle clinical metrics snapshot (Nursing Officer)" },
  { resource: "labDocument", action: "read", description: "Read a patient's lab document approval metadata (no analyte values)" },
  { resource: "caseLock", action: "read", description: "Read whether a patient's case is currently locked" },
  { resource: "activityLog", action: "read", description: "Read a patient's clinical activity log (union of clinical notes and lab documents)" },
  { resource: "availability", action: "read", description: "Read another consultant's availability blocks (Regional Admin scheduling a New Consultation)" },
  { resource: "nursingCase", action: "create", description: "Start a nursing case for a patient's regimen cycle visitation" },
  { resource: "staffAccount", action: "create", description: "Provision a staff account inside one's region (Regional Admin); grants no lock/unlock authority" },
  { resource: "staffAccount", action: "read", description: "List the staff accounts in one's region (Regional Admin)" },
  { resource: "nursingCase", action: "read", description: "Watch nursing cases and their live progress across the caller's region" },
  { resource: "nursingCase", action: "update", description: "Review a nursing case's documentation and record a QA decision (QA Officer only)" },
  { resource: "securityIncident", action: "read", description: "Read upload-security-incident reports (rejected/infected file uploads)" },
  // Drug supply chain (ONCOFLOW_DRUG_RECONCILIATION_WORKFLOW.md): ownership is enforced in the controllers on top of these grants.
  { resource: "drugRequest", action: "create", description: "Request drugs, and view/cancel one's own requests (Nursing Officer)" },
  { resource: "drugRequest", action: "read", description: "Read the drug request queue for one's region (Regional Admin)" },
  { resource: "drugDispatch", action: "create", description: "Dispatch a drug request from regional stock (Regional Admin)" },
  { resource: "drugDispatch", action: "update", description: "Acknowledge receipt of a dispatch addressed to oneself (Nursing Officer)" },
  { resource: "drugStock", action: "read", description: "Read one's own drug stock (Nursing Officer)" },
  { resource: "drugUsage", action: "create", description: "Log a drug administered against one's own nursing case" },
  { resource: "drugLoss", action: "create", description: "Report spillage or breakage of drugs in one's own stock" },
  { resource: "drugLoss", action: "read", description: "Read drug loss/incident reports for one's region (Regional Admin, SDNS)" },
  { resource: "drugReconciliation", action: "create", description: "Record a physical stock count (officers: own stock only)" },
  { resource: "drugReconciliation", action: "read", description: "Read stock reconciliations and their variances" },
  { resource: "drugReconciliation", action: "update", description: "Resolve a reconciliation variance and count any officer's or regional stock (Regional Admin)" },
  { resource: "drugAlert", action: "read", description: "Read regional stock, per-officer stock and drug alerts (Regional Admin)" },
];

// Seeds roles, permissions and the per-role grants.
export async function seedIdentity() {
  for (const name of ROLES) {
    const existingRole = await db.execute<{ id: string }>(
      sql`SELECT id FROM "role" WHERE name = ${name} LIMIT 1`,
    );
    if (existingRole.length === 0) {
      const id = crypto.randomUUID();
      await db.insert(role).values({
        id,
        name,
        description: name.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
      });
      console.log(`  Created role: ${name}`);
    }
  }

  const allRoles = await db.execute<{ id: string; name: string }>(sql`SELECT id, name FROM "role"`);
  const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

  const superAdminRoleId = roleMap.get("SUPER_ADMIN")!;
  const permMap = new Map<string, string>();

  for (const p of PERMISSIONS) {
    const existingPerm = await db.execute<{ id: string }>(
      sql`SELECT id FROM "permission" WHERE resource = ${p.resource} AND action = ${p.action} LIMIT 1`,
    );

    let permId: string;
    if (existingPerm.length === 0) {
      permId = crypto.randomUUID();
      await db.insert(permission).values({
        id: permId,
        resource: p.resource,
        action: p.action,
        description: p.description,
      });
      console.log(`  Created permission: ${p.resource}:${p.action}`);
    } else {
      permId = existingPerm[0]!.id;
    }
    permMap.set(`${p.resource}:${p.action}`, permId);

    const existingRp = await db.execute(
      sql`SELECT id FROM role_permission WHERE role_id = ${superAdminRoleId} AND permission_id = ${permId} LIMIT 1`,
    );
    if (existingRp.length === 0) {
      await db.insert(rolePermission).values({
        id: crypto.randomUUID(),
        roleId: superAdminRoleId,
        permissionId: permId,
      });
    }
  }

  // Grants the listed permission keys to a role, skipping existing grants.
  async function grantPermissionsToRole(roleName: string, keys: string[]) {
    const roleId = roleMap.get(roleName)!;
    for (const key of keys) {
      const permId = permMap.get(key);
      if (!permId) continue;
      const existingRp = await db.execute(
        sql`SELECT id FROM role_permission WHERE role_id = ${roleId} AND permission_id = ${permId} LIMIT 1`,
      );
      if (existingRp.length === 0) {
        await db.insert(rolePermission).values({ id: crypto.randomUUID(), roleId, permissionId: permId });
        console.log(`  Granted ${key} to ${roleName}`);
      }
    }
  }

  // Regional Admin grants, scoped to what its dashboard uses: patient search and registration, invoicing, countdown, and scoped lab results.
  await grantPermissionsToRole("REGIONAL_ADMIN", [
    // patient:update covers confirming or reassigning a facility, the last onboarding step.
    "patient:read", "patient:create", "patient:update", "patient:call",
    "invoice:create", "invoice:read", "invoice:send", "tariff:read",
    // appointment:create plus availability:read power the New Consultation flow.
    "appointment:read", "appointment:update", "appointment:create",
    "availability:read",
    "countdownCase:read",
    "labResult:read",
    "publicInquiry:read", "publicInquiry:update",
    "staffing:read", "staffing:update",
    "inventory:read", "inventory:update",
    "transferRequest:create", "transferRequest:read",
    "nursingCase:read",
    "staffAccount:create", "staffAccount:read",
    "audit:read",
    // Lets Regional Admin see rejected-upload incidents in its alert aggregator.
    "securityIncident:read",
    // Dispatches drug requests, oversees regional and per-officer stock, and reviews losses and variances.
    "drugRequest:read", "drugDispatch:create", "drugLoss:read",
    "drugReconciliation:create", "drugReconciliation:read", "drugReconciliation:update",
    "drugAlert:read",
  ]);

  // Virtual Medical Officer grants for side-effect reports, including conversation:update to close one.
  await grantPermissionsToRole("VIRTUAL_MEDICAL_OFFICER", [
    "conversation:create", "conversation:read", "conversation:update",
    "message:create", "message:read",
    // The checklist that unlocks the chat-scoped patient folder, and the hand-off to a Specialist Oncologist.
    "triage:create", "triage:read", "specialistEscalation:create",
  ]);

  // Escalations: the Regional Admin acts on them (schedules the consult), Clinical Directors are only informed.
  await grantPermissionsToRole("REGIONAL_ADMIN", ["specialistEscalation:read", "specialistEscalation:update"]);
  await grantPermissionsToRole("STATE_CLINICAL_DIRECTOR", ["specialistEscalation:read"]);
  await grantPermissionsToRole("NATIONAL_CLINICAL_DIRECTOR", ["specialistEscalation:read"]);

  // Onsite Nursing Officer grants for the case wizard (cases, regimen cycles, files, incidents) and the Inventory tab.
  await grantPermissionsToRole("ONSITE_NURSING_OFFICER", [
    "patient:call", "patient:read",
    "regimen:read",
    "nursingCase:create",
    "file:create", "file:read",
    // Read-only catalog; stock now moves only through the ledgers (requests, receipts, usage, loss), never manual edits.
    "inventory:read",
    "drugRequest:create", "drugDispatch:update", "drugStock:read", "drugUsage:create", "drugLoss:create",
    "drugReconciliation:create",
    // The nursing documentation form: vitals and the biometrics/lab panel it submits, and reading back
    // whether its own submission triggered a case lock.
    "vital:create", "clinicalMetrics:create", "caseLock:read",
  ]);

  // Consulting Oncologist grants: appointment grid, patient file, video room and transcript, and clinical notes.
  await grantPermissionsToRole("CONSULTING_ONCOLOGIST", [
    "patient:read",
    "appointment:read", "appointment:update",
    "meeting:create", "meeting:read", "meeting:update",
    "transcript:read",
    "labRequest:read", "labResult:read",
    "countdownCase:read",
    "clinicalNote:create", "clinicalNote:read",
    // regimen:create — prescribing a new treatment plan (and stating its diagnosis) is a consultant's call.
    "regimen:read", "regimen:create", "vital:read", "vital:create", "clinicalMetrics:read", "labDocument:read", "caseLock:read",
    "activityLog:read",
  ]);

  // QA Officer grants: reviewing a nursing case as a whole, reading the patient context (vitals,
  // clinical metrics and any active case lock) the submitted documentation sheet drew on, and — for the
  // patient folder — the patient's prior files/documentation from earlier visitations.
  await grantPermissionsToRole("QUALITY_ASSURANCE_OFFICER", [
    "nursingCase:update",
    "patient:read",
    "vital:read", "clinicalMetrics:read", "caseLock:read",
    "file:read",
  ]);

  // SDNS sees the region's stock incidents (breakage, spoilage, expiry, wastage) alongside Regional Admin.
  // It also watches nurse case activity, read-only (the same live board Regional Admin sees).
  await grantPermissionsToRole("STATE_DIRECTOR_OF_NURSING_SERVICES", ["drugLoss:read", "nursingCase:read"]);

  // Every other role still has zero grants — that real RBAC pass is still pending.

  console.log("Identity seed complete.");
}

// Self-invokes only when run directly, since seed/index.ts also awaits it and two runs would race on an empty database.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedIdentity().catch(console.error);
}
