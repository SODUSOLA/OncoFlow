import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { eq } from "drizzle-orm";

const app = createApp();

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

it("password hash never appears in response", async () => {
  const email = `nohash-${Date.now()}@example.com`;
  const res = await request(app).post("/auth/register").send({ email, password: "Password123!" });
  expect(res.status).toBe(201);
  expect(res.body.user?.passwordHash).toBeUndefined();
  expect(res.body.user?.password).toBeUndefined();
  expect(JSON.stringify(res.body)).not.toContain("$2a$");
});
