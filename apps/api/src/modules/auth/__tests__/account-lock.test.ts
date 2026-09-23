import { describe, it, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../../../app.js";
import crypto from "node:crypto";
import { db } from "../../../db/index.js";
import { accountLock, misconductFlag } from "../schema.js";

const app = createApp();
const base = "/auth";

// Registers a user through the API and returns the response.
async function registerUser(email: string) {
  const res = await request(app)
    .post(`${base}/register`)
    .send({ email, password: "Password123!" });
  return res.body.user as { id: string; email: string };
}

// Extracts the session cookie from a login response.
function cookieFromLogin(loginRes: request.Response): string {
  const cookieHeader = loginRes.headers["set-cookie"];
  const cookies = Array.isArray(cookieHeader) ? cookieHeader : cookieHeader ? [cookieHeader] : [];
  return cookies.find((c: string) => c.startsWith("oncoflow_session=")) ?? "";
}

describe("AccountLock — login guard", () => {
  it("rejects login when user has an active AccountLock", async () => {
    const user = await registerUser("locked-" + crypto.randomUUID().slice(0, 8) + "@test.com");
    await db.insert(accountLock).values({
      id: crypto.randomUUID(),
      userId: user.id,
      lockedBy: user.id,
      reason: "Test lock",
      lockType: "24H_ADMIN",
      lockedAt: new Date(),
    });

    const res = await request(app)
      .post(`${base}/login`)
      .send({ email: user.email, password: "Password123!" });
    expect(res.status).toBe(401);
  });

  it("allows login when lock has expired", async () => {
    const user = await registerUser("expired-" + crypto.randomUUID().slice(0, 8) + "@test.com");
    await db.insert(accountLock).values({
      id: crypto.randomUUID(),
      userId: user.id,
      lockedBy: user.id,
      reason: "Expired lock",
      lockType: "24H_ADMIN",
      lockedAt: new Date(Date.now() - 86400000 * 2),
      lockedUntil: new Date(Date.now() - 86400000),
    });

    const res = await request(app)
      .post(`${base}/login`)
      .send({ email: user.email, password: "Password123!" });
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("allows login when lock is soft-deleted", async () => {
    const user = await registerUser("deletedlock-" + crypto.randomUUID().slice(0, 8) + "@test.com");
    await db.insert(accountLock).values({
      id: crypto.randomUUID(),
      userId: user.id,
      lockedBy: user.id,
      reason: "Deleted lock",
      lockType: "24H_ADMIN",
      lockedAt: new Date(),
      isDeleted: true,
      deletedAt: new Date(),
    });

    const res = await request(app)
      .post(`${base}/login`)
      .send({ email: user.email, password: "Password123!" });
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
  });
});

describe("MisconductFlag — CRUD", () => {
  it("creates a misconduct flag", async () => {
    const user = await registerUser("misconduct-" + crypto.randomUUID().slice(0, 8) + "@test.com");
    const flagId = crypto.randomUUID();
    await db.insert(misconductFlag).values({
      id: flagId,
      flaggedUserId: user.id,
      triggerReason: "Inappropriate message content",
      status: "OPEN",
    });

    const rows = await db.select().from(misconductFlag).where(eq(misconductFlag.id, flagId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("OPEN");
  });

  it("updates misconduct flag status", async () => {
    const user = await registerUser("misconduct-upd-" + crypto.randomUUID().slice(0, 8) + "@test.com");
    const flagId = crypto.randomUUID();
    await db.insert(misconductFlag).values({
      id: flagId,
      flaggedUserId: user.id,
      triggerReason: "Spam",
      status: "OPEN",
    });

    await db
      .update(misconductFlag)
      .set({ status: "CLEARED", resolvedAt: new Date() })
      .where(eq(misconductFlag.id, flagId));

    const rows = await db.select().from(misconductFlag).where(eq(misconductFlag.id, flagId));
    expect(rows[0]!.status).toBe("CLEARED");
    expect(rows[0]!.resolvedAt).not.toBeNull();
  });
});
