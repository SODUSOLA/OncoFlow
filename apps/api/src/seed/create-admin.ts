import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { user, userRole } from "../db/schema.js";
import { User } from "../modules/auth/index.js";

// Makes sure a Super Admin exists for the email. An existing account is left alone apart from making sure it holds
// the role, so this never resets a password.
export async function ensureAdmin(opts: { email: string; password: string; firstName?: string; lastName?: string }) {
  const email = opts.email.trim().toLowerCase();
  if (!email || !opts.password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD");
  if (opts.password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");

  const roleRows = await db.execute<{ id: string }>(sql`SELECT id FROM "role" WHERE name = 'SUPER_ADMIN' LIMIT 1`);
  if (roleRows.length === 0) throw new Error("SUPER_ADMIN role not found — run the reference seed first (npm run seed:production)");

  const existing = await db.execute<{ id: string }>(sql`SELECT id FROM "user" WHERE email = ${email} LIMIT 1`);
  let userId: string;
  if (existing.length > 0) {
    userId = existing[0]!.id;
    console.log(`An account for ${email} already exists; its password was not changed.`);
  } else {
    userId = crypto.randomUUID();
    await db.insert(user).values({
      id: userId, email, firstName: opts.firstName ?? "System", lastName: opts.lastName ?? "Administrator",
      passwordHash: await User.hashPassword(opts.password), status: "ACTIVE", mfaEnabled: false, facilityId: null,
    });
    console.log(`Created ${email}`);
  }

  const has = await db.execute(sql`SELECT 1 FROM user_role WHERE user_id = ${userId} AND role_id = ${roleRows[0]!.id} LIMIT 1`);
  if (has.length === 0) {
    await db.insert(userRole).values({ id: crypto.randomUUID(), userId, roleId: roleRows[0]!.id });
    console.log("Assigned SUPER_ADMIN");
  }
}

// Runs only when invoked directly, reading ADMIN_EMAIL and ADMIN_PASSWORD.
if (import.meta.url === `file://${process.argv[1]}`) {
  ensureAdmin({
    email: process.env.ADMIN_EMAIL ?? "", password: process.env.ADMIN_PASSWORD ?? "",
    firstName: process.env.ADMIN_FIRST_NAME, lastName: process.env.ADMIN_LAST_NAME,
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
