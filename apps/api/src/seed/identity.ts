import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import { role, permission, rolePermission } from "../db/schema.js";

// PATIENT deliberately receives NO permission grants below, and that's correct, not an
// oversight: every "view/edit own X" capability in the Patient role spec (profile, timeline,
// invoices, wallet, lab results, lab requests, files, conversations, messages, meetings) is
// enforced via an ownership check in the relevant controller/service (callerOwnsPatient —
// patient/controller.ts, clinical/controller.ts, documents/controller.ts, billing/controller.ts,
// messaging/service.ts), not a resource:action grant. Granting PATIENT a blanket permission
// like patient:read or invoice:read here would let any patient read every OTHER patient's
// data too — permissions in this system aren't scoped to "own records only," ownership checks
// are what make self-service safe. If a genuinely role-wide (not per-record) PATIENT capability
// is ever needed, that's the case to add a real grant for — self-access to one's own records
// should keep going through ownership, not a permission.
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
  // FR-24: one calendar endpoint reused by every role — same permission string for all of
  // them, since the endpoint itself resolves per-caller scope server-side (controller), not
  // per-role permission variants. Like every other permission here, only SUPER_ADMIN is
  // granted it for now; per-role grants are pending the same real RBAC-seeding pass the rest
  // of this file is waiting on.
  { resource: "calendar", action: "read", description: "Read the unified calendar (FR-24)" },
  { resource: "staffing", action: "read", description: "Read the facility staffing/shift grid" },
  { resource: "staffing", action: "update", description: "Assign nurses to shifts and publish a week's schedule" },
  { resource: "inventory", action: "read", description: "Read regional drug stock levels and open reconciliation variances" },
  { resource: "inventory", action: "update", description: "Record a purchase/dispatch movement and resolve a reconciliation variance" },
  { resource: "transferRequest", action: "create", description: "Initiate a patient facility transfer request" },
  { resource: "transferRequest", action: "read", description: "Read facility transfer requests" },
];

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

  // First real (non-SUPER_ADMIN) per-role grant in this seed — scoped tightly to what
  // apps/dashboard's Regional Admin view actually exercises today: patient search + the new
  // registration-approval flow (patient:create), invoice generation/listing, the 7-day
  // countdown table, and lab results (labResult:read's own description above already
  // documents "Regional Admin gets the scoped view" as the intent).
  await grantPermissionsToRole("REGIONAL_ADMIN", [
    // patient:update covers confirming/reassigning a new patient's facility
    // (PATCH /patients/:id/confirm-facility) — the last step of onboarding now that the
    // patient record itself is auto-created at email verification.
    "patient:read", "patient:create", "patient:update", "patient:call",
    "invoice:create", "invoice:read", "tariff:read",
    "appointment:read", "appointment:update",
    "countdownCase:read",
    "labResult:read",
    "publicInquiry:read", "publicInquiry:update",
    "staffing:read", "staffing:update",
    "inventory:read", "inventory:update",
    "transferRequest:create", "transferRequest:read",
  ]);

  // Second real per-role grant — the Virtual Medical Officer handling MO_SIDE_EFFECT reports:
  // reading/replying to conversations they're assigned, and closing one once the encounter is
  // resolved (closeConversation's ownership-or-permission check needs conversation:update here).
  await grantPermissionsToRole("VIRTUAL_MEDICAL_OFFICER", [
    "conversation:create", "conversation:read", "conversation:update",
    "message:create", "message:read",
  ]);

  // Third real per-role grant — Onsite Nursing Officer's first-ever grant in this seed.
  // patient:call only, for now: click-to-call is the one capability confirmed for this role
  // this round (docs/build-plan/08-stakeholder-role-matrix.md's Onsite Nursing Officer section
  // doesn't otherwise scope a real permission grant yet — that broader pass is still pending).
  await grantPermissionsToRole("ONSITE_NURSING_OFFICER", ["patient:call"]);

  // Every other role still has zero grants — that real RBAC pass is still pending.

  console.log("Identity seed complete.");
}

// Only self-invoke when run directly (`npx tsx src/seed/identity.ts`) — seed/index.ts also
// imports and awaits this export, and without this guard both invocations would race on the
// same "does this role exist yet?" check against an empty database (23505 duplicate key).
if (import.meta.url === `file://${process.argv[1]}`) {
  seedIdentity().catch(console.error);
}
