import { db } from "../db";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import { role, permission, rolePermission } from "../db/schema";

const ROLES = [
  "PATIENT",
  "REGIONAL_ADMIN",
  "VIRTUAL_MEDICAL_OFFICER",
  "CONSULTING_ONCOLOGIST",
  "STATE_CLINICAL_DIRECTOR",
  "QUALITY_ASSURANCE_OFFICER",
  "ONSITE_NURSING_OFFICER",
  "NATIONAL_CLINICAL_DIRECTOR",
  "STATE_DIRECTOR_OF_NURSING_SERVICES",
  "NATIONAL_DIRECTOR_OF_NURSING_SERVICES",
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
  { resource: "countdownCase", action: "read", description: "Read countdown cases" },
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
