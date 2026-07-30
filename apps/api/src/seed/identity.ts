import { db } from "../db/index.js";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import { role, permission, rolePermission } from "../db/schema.js";

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
  { resource: "patient", action: "update", description: "Update patient records" },
  { resource: "patient", action: "delete", description: "Delete patient records" },
  { resource: "wallet", action: "read", description: "Read wallet records" },
  { resource: "invoice", action: "create", description: "Create invoices" },
  { resource: "invoice", action: "read", description: "Read invoices" },
  { resource: "invoice", action: "update", description: "Update invoices" },
  { resource: "serviceClassification", action: "read", description: "Read service classifications" },
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

  console.log("Identity seed complete.");
}

seedIdentity().catch(console.error);
