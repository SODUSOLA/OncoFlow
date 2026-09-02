import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { eq } from "drizzle-orm";

const app = createApp();

function sessionIdFrom(loginRes: { headers: { "set-cookie"?: string[] } }): string {
  const cookies = loginRes.headers["set-cookie"] ?? [];
  const cookieStr = cookies.find((c) => c.startsWith("oncoflow_session="));
  return cookieStr!.split(";")[0]!.split("=")[1]!;
}

let createdUserId: string | null = null;
let sessionCookie: string | null = null;

afterAll(async () => {
  if (createdUserId) {
    const { user } = await import("../schema.js");
    await db.delete(user).where(eq(user.id, createdUserId)).catch(() => {});
  }
});

it("register creates a user", async () => {
  const email = `test-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "Password123!" });

  expect(res.status).toBe(201);
  expect(res.body.user).toBeDefined();
  expect(res.body.user.email).toBe(email);
  expect(res.body.user.passwordHash).toBeUndefined();
  createdUserId = res.body.user.id;
});

it("register grants the PATIENT role — the only real caller of this endpoint today", async () => {
  const email = `patient-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "Password123!" });

  expect(res.status).toBe(201);
  const userId: string = res.body.user.id;

  const { user, userRole, role } = await import("../schema.js");
  const rows = await db
    .select({ roleName: role.name })
    .from(userRole)
    .innerJoin(role, eq(userRole.roleId, role.id))
    .where(eq(userRole.userId, userId));

  expect(rows.some((r) => r.roleName === "PATIENT")).toBe(true);

  await db.delete(user).where(eq(user.id, userId)).catch(() => {});
});

// Gender is part of the intake snapshot now. It was added as a NOT NULL column in migration
// 0011, which deliberately dropped its temporary backfill default so new rows must carry a real
// value, and patient.gender is NOT NULL too — so a snapshot without it could never satisfy the
// auto-registration that reads it (verifyEmail -> registerPatient). The registration wizard
// collects biological sex on step 1 and always sends it.
it("register with a complete intake creates a pending patient_registration_request", async () => {
  const email = `intake-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/auth/register")
    .send({
      email, password: "Password123!",
      fullName: "Test Intake Patient", dob: "1990-01-01", gender: "Female", phone: "+2348000000000",
    });

  expect(res.status).toBe(201);
  const userId: string = res.body.user.id;

  const { patientRegistrationRequest } = await import("../../patient/schema.js");
  const rows = await db.select().from(patientRegistrationRequest).where(eq(patientRegistrationRequest.userId, userId));
  expect(rows).toHaveLength(1);
  expect(rows[0]!.fullName).toBe("Test Intake Patient");
  expect(rows[0]!.email).toBe(email);
  expect(rows[0]!.gender).toBe("Female");

  const { user } = await import("../schema.js");
  await db.delete(patientRegistrationRequest).where(eq(patientRegistrationRequest.userId, userId)).catch(() => {});
  await db.delete(user).where(eq(user.id, userId)).catch(() => {});
});

// The intake snapshot is deliberately all-or-nothing: register() only writes it when fullName,
// dob, gender and phone are all present. A partial intake creates the login but no snapshot,
// so auto-registration correctly no-ops rather than half-creating a patient with a missing
// field. Pinned explicitly so the rule is asserted rather than assumed.
//
// Note this means a partial intake is currently accepted silently (201, no snapshot). That is
// almost certainly a client bug when it happens, and rejecting it with a 400 would surface it
// — left as-is here because changing it is a contract change, not a test fix.
it("register with an intake missing gender creates no registration request", async () => {
  const email = `partial-intake-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/auth/register")
    .send({
      email, password: "Password123!",
      fullName: "Partial Intake Patient", dob: "1990-01-01", phone: "+2348000000000",
    });

  expect(res.status).toBe(201);
  const userId: string = res.body.user.id;

  const { patientRegistrationRequest } = await import("../../patient/schema.js");
  const rows = await db.select().from(patientRegistrationRequest).where(eq(patientRegistrationRequest.userId, userId));
  expect(rows).toHaveLength(0);

  const { user } = await import("../schema.js");
  await db.delete(user).where(eq(user.id, userId)).catch(() => {});
});

it("register without fullName/dob/phone does not create a registration request (bare email+password still works)", async () => {
  const email = `bare-${Date.now()}@example.com`;
  const res = await request(app).post("/auth/register").send({ email, password: "Password123!" });
  expect(res.status).toBe(201);
  const userId: string = res.body.user.id;

  const { patientRegistrationRequest } = await import("../../patient/schema.js");
  const rows = await db.select().from(patientRegistrationRequest).where(eq(patientRegistrationRequest.userId, userId));
  expect(rows).toHaveLength(0);

  const { user } = await import("../schema.js");
  await db.delete(user).where(eq(user.id, userId)).catch(() => {});
});

it("register rejects duplicate email", async () => {
  const email = `dup-${Date.now()}@example.com`;
  await request(app).post("/auth/register").send({ email, password: "Password123!" });
  const res = await request(app).post("/auth/register").send({ email, password: "Password123!" });
  expect(res.status).toBe(409);
});

it("login returns session and user", async () => {
  const email = `login-${Date.now()}@example.com`;
  await request(app).post("/auth/register").send({ email, password: "Password123!" });

  const res = await request(app)
    .post("/auth/login")
    .send({ email, password: "Password123!" });

  expect(res.status).toBe(200);
  expect(res.body.user).toBeDefined();
  expect(res.body.mfaRequired).toBe(false);
  expect(res.body.mfaVerified).toBe(true);
  expect(res.body.user.passwordHash).toBeUndefined();

  const cookies = res.headers["set-cookie"];
  expect(cookies).toBeDefined();
  sessionCookie = Array.isArray(cookies) ? cookies[0] : cookies;
  expect(sessionCookie).toContain("oncoflow_session");
});

it("login rejects wrong password", async () => {
  const email = `badpw-${Date.now()}@example.com`;
  await request(app).post("/auth/register").send({ email, password: "Password123!" });
  const res = await request(app)
    .post("/auth/login")
    .send({ email, password: "wrongpasslongenough" });
  expect(res.status).toBe(401);
  expect(res.body.error).toBe("Invalid email or password");
});

it("login rejects nonexistent email", async () => {
  const res = await request(app)
    .post("/auth/login")
    .send({ email: `nonexistent-${Date.now()}@example.com`, password: "somepassword1" });
  expect(res.status).toBe(401);
  expect(res.body.error).toBe("Invalid email or password");
});

it("logout revokes session", async () => {
  const email = `logout-${Date.now()}@example.com`;
  const reg = await request(app).post("/auth/register").send({ email, password: "Password123!" });
  expect(reg.status).toBe(201);

  const login = await request(app).post("/auth/login").send({ email, password: "Password123!" });
  expect(login.status).toBe(200);

  const cookieHeader = login.headers["set-cookie"];
  const cookies = Array.isArray(cookieHeader) ? cookieHeader : cookieHeader ? [cookieHeader] : [];
  const sessionCookieStr = cookies.find((c: string) => c.startsWith("oncoflow_session="));
  expect(sessionCookieStr).toBeDefined();
  const sid = sessionCookieStr!.split(";")[0]!.split("=")[1]!;

  const res = await request(app).post("/auth/logout").set("Cookie", `oncoflow_session=${sid}`);
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);

  const { session: sessionTbl } = await import("../schema.js");
  const row = await db.select().from(sessionTbl).where(eq(sessionTbl.id, sid)).limit(1);
  expect(row[0]?.revokedAt).not.toBeNull();
});

it("GET /auth/profile works for a plain PATIENT account with no permission grants", async () => {
  // Regression test: this endpoint was previously gated by requirePermission("user", "read"),
  // which a freshly-registered PATIENT account never has (seed/identity.ts deliberately grants
  // it none) — every such account got a 403 here, breaking any client's "am I logged in" check.
  const email = `profile-${Date.now()}@example.com`;
  await request(app).post("/auth/register").send({ email, password: "Password123!" });

  const login = await request(app).post("/auth/login").send({ email, password: "Password123!" });
  const cookieHeader = login.headers["set-cookie"];
  const cookies = Array.isArray(cookieHeader) ? cookieHeader : cookieHeader ? [cookieHeader] : [];
  const sessionCookieStr = cookies.find((c: string) => c.startsWith("oncoflow_session="));
  const sid = sessionCookieStr!.split(";")[0]!.split("=")[1]!;

  const res = await request(app).get("/auth/profile").set("Cookie", `oncoflow_session=${sid}`);
  expect(res.status).toBe(200);
  expect(res.body.user.email).toBe(email);
  expect(res.body.roles.some((r: { roleName: string }) => r.roleName === "PATIENT")).toBe(true);
});

it("GET /auth/sessions lists the caller's own sessions and flags the current one", async () => {
  const email = `sessions-${Date.now()}@example.com`;
  await request(app).post("/auth/register").send({ email, password: "Password123!" });

  const loginA = await request(app).post("/auth/login").send({ email, password: "Password123!" });
  const sidA = sessionIdFrom(loginA);
  const loginB = await request(app).post("/auth/login").send({ email, password: "Password123!" });
  const sidB = sessionIdFrom(loginB);

  const res = await request(app).get("/auth/sessions").set("Cookie", `oncoflow_session=${sidA}`);
  expect(res.status).toBe(200);
  const ids = res.body.sessions.map((s: { id: string }) => s.id);
  expect(ids).toEqual(expect.arrayContaining([sidA, sidB]));
  const current = res.body.sessions.find((s: { id: string }) => s.id === sidA);
  expect(current.isCurrent).toBe(true);
  const other = res.body.sessions.find((s: { id: string }) => s.id === sidB);
  expect(other.isCurrent).toBe(false);
});

it("GET /auth/sessions does not leak another user's sessions", async () => {
  const emailA = `sessions-a-${Date.now()}@example.com`;
  await request(app).post("/auth/register").send({ email: emailA, password: "Password123!" });
  const loginA = await request(app).post("/auth/login").send({ email: emailA, password: "Password123!" });
  const sidA = sessionIdFrom(loginA);

  const emailB = `sessions-b-${Date.now()}@example.com`;
  await request(app).post("/auth/register").send({ email: emailB, password: "Password123!" });
  const loginB = await request(app).post("/auth/login").send({ email: emailB, password: "Password123!" });
  const sidB = sessionIdFrom(loginB);

  const res = await request(app).get("/auth/sessions").set("Cookie", `oncoflow_session=${sidA}`);
  const ids = res.body.sessions.map((s: { id: string }) => s.id);
  expect(ids).not.toContain(sidB);
});

it("POST /auth/sessions/:id/revoke revokes a different session belonging to the same user", async () => {
  const email = `revoke-${Date.now()}@example.com`;
  await request(app).post("/auth/register").send({ email, password: "Password123!" });

  const loginA = await request(app).post("/auth/login").send({ email, password: "Password123!" });
  const sidA = sessionIdFrom(loginA);
  const loginB = await request(app).post("/auth/login").send({ email, password: "Password123!" });
  const sidB = sessionIdFrom(loginB);

  const res = await request(app).post(`/auth/sessions/${sidB}/revoke`).set("Cookie", `oncoflow_session=${sidA}`);
  expect(res.status).toBe(200);

  const { session: sessionTbl } = await import("../schema.js");
  const row = await db.select().from(sessionTbl).where(eq(sessionTbl.id, sidB)).limit(1);
  expect(row[0]?.revokedAt).not.toBeNull();
});

it("POST /auth/sessions/:id/revoke rejects revoking another user's session", async () => {
  const emailA = `revoke-a-${Date.now()}@example.com`;
  await request(app).post("/auth/register").send({ email: emailA, password: "Password123!" });
  const loginA = await request(app).post("/auth/login").send({ email: emailA, password: "Password123!" });
  const sidA = sessionIdFrom(loginA);

  const emailB = `revoke-b-${Date.now()}@example.com`;
  await request(app).post("/auth/register").send({ email: emailB, password: "Password123!" });
  const loginB = await request(app).post("/auth/login").send({ email: emailB, password: "Password123!" });
  const sidB = sessionIdFrom(loginB);

  const res = await request(app).post(`/auth/sessions/${sidB}/revoke`).set("Cookie", `oncoflow_session=${sidA}`);
  expect(res.status).toBe(404);
});

it("POST /auth/sessions/:id/revoke rejects revoking the caller's own current session", async () => {
  const email = `revoke-self-${Date.now()}@example.com`;
  await request(app).post("/auth/register").send({ email, password: "Password123!" });
  const login = await request(app).post("/auth/login").send({ email, password: "Password123!" });
  const sid = sessionIdFrom(login);

  const res = await request(app).post(`/auth/sessions/${sid}/revoke`).set("Cookie", `oncoflow_session=${sid}`);
  expect(res.status).toBe(400);
});

it("password hash never appears in response", async () => {
  const email = `nohash-${Date.now()}@example.com`;
  const res = await request(app).post("/auth/register").send({ email, password: "Password123!" });
  expect(res.status).toBe(201);
  expect(res.body.user?.passwordHash).toBeUndefined();
  expect(res.body.user?.password).toBeUndefined();
  expect(JSON.stringify(res.body)).not.toContain("$2a$");
});
