import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { facility } from "../../facility/schema.js";
import { user, session, role, userRole, passwordResetToken } from "../schema.js";
import { auditLog } from "../../audit/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";
import { seedIdentity } from "../../../seed/identity.js";

const app = createApp();
const REGION = `Provision Region ${crypto.randomUUID().slice(0, 8)}`;

let facilityId: string;
let otherRegionFacilityId: string;
let admin: { id: string; cookie: string };
let otherAdmin: { id: string; cookie: string };
let nurse: { id: string; cookie: string };
let sdns: { id: string; cookie: string };

async function createUser(roleName: string, facilityId_: string): Promise<{ id: string; cookie: string }> {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, email: `prov-${crypto.randomUUID()}@test.com`, passwordHash: "test", facilityId: facilityId_ });
  const roleRow = await db.select().from(role).where(eq(role.name, roleName as never)).limit(1);
  await db.insert(userRole).values({ userId: id, roleId: roleRow[0]!.id });
  const sid = crypto.randomUUID();
  await db.insert(session).values({ id: sid, userId: id, device: "test", ip: "127.0.0.1", expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true });
  return { id, cookie: `${SESSION_COOKIE_NAME}=${sid}` };
}
async function createFacility(region: string) {
  return (await db.insert(facility).values({ id: crypto.randomUUID(), name: `Prov Facility ${crypto.randomUUID().slice(0, 6)}`, region, address: "P St", status: "ACTIVE" }).returning())[0]!.id;
}

beforeAll(async () => {
  await seedIdentity();
  facilityId = await createFacility(REGION);
  otherRegionFacilityId = await createFacility(`${REGION} Elsewhere`);
  admin = await createUser("REGIONAL_ADMIN", facilityId);
  otherAdmin = await createUser("REGIONAL_ADMIN", otherRegionFacilityId);
  nurse = await createUser("ONSITE_NURSING_OFFICER", facilityId);
  sdns = await createUser("STATE_DIRECTOR_OF_NURSING_SERVICES", facilityId);
});

const body = (over: Record<string, unknown> = {}) => ({
  email: `new-${crypto.randomUUID()}@test.com`, firstName: "Ada", lastName: "Obi", role: "ONSITE_NURSING_OFFICER", facilityId, ...over,
});

describe("POST /staff-accounts", () => {
  it("creates a staff account in the admin's region with the role, an unusable password and a 72h invite", async () => {
    const payload = body();
    const res = await request(app).post("/staff-accounts").set("Cookie", admin.cookie).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: payload.email, firstName: "Ada", lastName: "Obi", facilityId, status: "ACTIVE" });
    expect(res.body.user.passwordHash).toBeUndefined();

    const [row] = await db.select().from(user).where(eq(user.id, res.body.user.id));
    expect(row!.passwordHash).not.toBe("");
    // The admin can't know the password: nobody can log in with anything they could have chosen.
    const login = await request(app).post("/auth/login").send({ email: payload.email, password: "Password123!" });
    expect(login.status).toBeGreaterThanOrEqual(400);

    const roles = await db.select({ name: role.name }).from(userRole).innerJoin(role, eq(role.id, userRole.roleId)).where(eq(userRole.userId, res.body.user.id));
    expect(roles.map((r) => r.name)).toEqual(["ONSITE_NURSING_OFFICER"]);
    const [invite] = await db.select().from(passwordResetToken).where(eq(passwordResetToken.userId, res.body.user.id));
    const hours = (invite!.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(71);
    expect(hours).toBeLessThanOrEqual(72);

    const audit = await db.select().from(auditLog).where(and(eq(auditLog.resource, "staffAccount"), eq(auditLog.resourceId, res.body.user.id)));
    expect(audit).toHaveLength(1);
  });

  it("refuses roles the admin may not create, a facility outside the region, duplicates, and non-admins", async () => {
    const post = (cookie: string, over: Record<string, unknown> = {}) => request(app).post("/staff-accounts").set("Cookie", cookie).send(body(over));
    for (const badRole of ["SUPER_ADMIN", "PATIENT", "REGIONAL_ADMIN", "STATE_DIRECTOR_OF_NURSING_SERVICES", "NATIONAL_CLINICAL_DIRECTOR", "NOT_A_ROLE"]) {
      expect((await post(admin.cookie, { role: badRole })).status, badRole).toBe(400);
    }
    expect((await post(admin.cookie, { facilityId: otherRegionFacilityId })).status).toBe(403);
    expect((await post(admin.cookie, { email: "not-an-email" })).status).toBe(400);
    const dup = body();
    expect((await request(app).post("/staff-accounts").set("Cookie", admin.cookie).send(dup)).status).toBe(201);
    expect((await request(app).post("/staff-accounts").set("Cookie", admin.cookie).send(dup)).status).toBe(409);
    // Nurses and SDNS have no provisioning power.
    expect((await post(nurse.cookie)).status).toBe(403);
    expect((await post(sdns.cookie)).status).toBe(403);
  });
});

describe("GET /staff-accounts and the SDNS read-only view", () => {
  it("lists only the caller's region", async () => {
    const created = await request(app).post("/staff-accounts").set("Cookie", admin.cookie).send(body({ role: "QUALITY_ASSURANCE_OFFICER" }));
    const mine = await request(app).get("/staff-accounts").set("Cookie", admin.cookie);
    expect(mine.status).toBe(200);
    const row = mine.body.staff.find((s: { id: string }) => s.id === created.body.user.id);
    expect(row).toMatchObject({ roles: ["QUALITY_ASSURANCE_OFFICER"], status: "ACTIVE", facilityId });
    const theirs = await request(app).get("/staff-accounts").set("Cookie", otherAdmin.cookie);
    expect(theirs.body.staff.some((s: { id: string }) => s.id === created.body.user.id)).toBe(false);
    expect((await request(app).get("/staff-accounts").set("Cookie", nurse.cookie)).status).toBe(403);
  });

  it("lets SDNS read the live nurse-activity board but never write to a case", async () => {
    expect((await request(app).get("/nursing-cases/live").set("Cookie", sdns.cookie)).status).toBe(200);
    const write = await request(app).post("/nursing-cases").set("Cookie", sdns.cookie).send({ patientId: crypto.randomUUID(), regimenCycleId: crypto.randomUUID() });
    expect(write.status).toBe(403);
  });
});
