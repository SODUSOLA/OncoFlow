import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { requirePermission, requireRole, invalidatePermissionCache } from "./rbac.js";
import { db } from "../db/index.js";
import { closeRedis, connectRedis } from "./redis.js";
import { sql, eq } from "drizzle-orm";

function createTestApp() {
  const app = express();
  app.get("/test", (req, _res, next) => {
    const userId = req.headers["x-test-user"];
    if (typeof userId === "string") {
      (req as unknown as { userId: string }).userId = userId;
    }
    next();
  }, requirePermission("test.resource", "read"), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

function createRoleTestApp() {
  const app = express();
  app.get("/role-test", (req, _res, next) => {
    const userId = req.headers["x-test-user"];
    if (typeof userId === "string") {
      (req as unknown as { userId: string }).userId = userId;
    }
    next();
  }, requireRole("VIRTUAL_MEDICAL_OFFICER"), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

let permissionId: string;
let roleId: string;

beforeAll(async () => {
  await connectRedis();
  const { role, permission, rolePermission, user, userRole } = await import("../modules/auth/schema.js");

  const existing = await db.execute<{ id: string }>(sql`
    SELECT id FROM "role" WHERE name = 'VIRTUAL_MEDICAL_OFFICER' LIMIT 1
  `);
  roleId = existing[0]?.id ?? crypto.randomUUID();
  if (existing.length === 0) {
    await db.insert(role).values({ id: roleId, name: "VIRTUAL_MEDICAL_OFFICER", description: "Test" });
  }

  permissionId = crypto.randomUUID();
  await db.insert(permission).values({ id: permissionId, resource: "test.resource", action: "read", description: "Test" });
  await db.insert(rolePermission).values({ roleId, permissionId });

  const rootUid = crypto.randomUUID();
  await db.insert(user).values({ id: rootUid, email: `rbac-root-${Date.now()}@example.com`, passwordHash: "test" });
  await db.insert(userRole).values({ userId: rootUid, roleId });
});

afterAll(async () => {
  const { permission, rolePermission } = await import("../modules/auth/schema.js");
  await db.delete(rolePermission).where(eq(rolePermission.permissionId, permissionId)).catch(() => {});
  await db.delete(permission).where(eq(permission.id, permissionId)).catch(() => {});
  await closeRedis();
});

it("returns 401 when no userId is set", async () => {
  const res = await request(createTestApp()).get("/test");
  expect(res.status).toBe(401);
});

it("returns 403 for user without permission", async () => {
  const res = await request(createTestApp()).get("/test").set("x-test-user", crypto.randomUUID());
  expect(res.status).toBe(403);
});

it("returns 200 for user with permission", async () => {
  const { user, userRole } = await import("../modules/auth/schema.js");
  const uid = crypto.randomUUID();
  await db.insert(user).values({ id: uid, email: `rbac-pass-${Date.now()}@example.com`, passwordHash: "test" });
  await db.insert(userRole).values({ userId: uid, roleId });
  const res = await request(createTestApp()).get("/test").set("x-test-user", uid);
  expect(res.status).toBe(200);
  await db.delete(userRole).where(eq(userRole.userId, uid)).catch(() => {});
  await db.delete(user).where(eq(user.id, uid)).catch(() => {});
});

it("cache hit works", async () => {
  const { user, userRole } = await import("../modules/auth/schema.js");
  const uid = crypto.randomUUID();
  await db.insert(user).values({ id: uid, email: `rbac-cache-${Date.now()}@example.com`, passwordHash: "test" });
  await db.insert(userRole).values({ userId: uid, roleId });
  const app = createTestApp();

  const res1 = await request(app).get("/test").set("x-test-user", uid);
  expect(res1.status).toBe(200);

  await db.delete(userRole).where(eq(userRole.userId, uid)).catch(() => {});

  const res2 = await request(app).get("/test").set("x-test-user", uid);
  expect(res2.status).toBe(200);

  await db.delete(user).where(eq(user.id, uid)).catch(() => {});
});

it("cache invalidation reflects role revocation", async () => {
  const { user, userRole } = await import("../modules/auth/schema.js");
  const uid = crypto.randomUUID();
  await db.insert(user).values({ id: uid, email: `rbac-revoke-${Date.now()}@example.com`, passwordHash: "test" });
  await db.insert(userRole).values({ userId: uid, roleId });
  const app = createTestApp();

  const res1 = await request(app).get("/test").set("x-test-user", uid);
  expect(res1.status).toBe(200);

  await db.delete(userRole).where(eq(userRole.userId, uid)).catch(() => {});

  const check = await db.execute<{ cnt: number }>(sql`SELECT COUNT(*)::int AS cnt FROM user_role WHERE user_id = ${uid}`);
  expect(check[0]?.cnt).toBe(0);

  await invalidatePermissionCache(uid);

  const res2 = await request(app).get("/test").set("x-test-user", uid);
  expect(res2.status).toBe(403);

  await db.delete(user).where(eq(user.id, uid)).catch(() => {});
});

describe("requireRole", () => {
  it("returns 401 when no userId is set", async () => {
    const res = await request(createRoleTestApp()).get("/role-test");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a user with the wrong role", async () => {
    const { user } = await import("../modules/auth/schema.js");
    const uid = crypto.randomUUID();
    await db.insert(user).values({ id: uid, email: `role-wrong-${Date.now()}@example.com`, passwordHash: "test" });
    const res = await request(createRoleTestApp()).get("/role-test").set("x-test-user", uid);
    expect(res.status).toBe(403);
    await db.delete(user).where(eq(user.id, uid)).catch(() => {});
  });

  it("returns 200 for a user with the required role", async () => {
    const { user, userRole } = await import("../modules/auth/schema.js");
    const uid = crypto.randomUUID();
    await db.insert(user).values({ id: uid, email: `role-right-${Date.now()}@example.com`, passwordHash: "test" });
    await db.insert(userRole).values({ userId: uid, roleId });
    const res = await request(createRoleTestApp()).get("/role-test").set("x-test-user", uid);
    expect(res.status).toBe(200);
    await db.delete(userRole).where(eq(userRole.userId, uid)).catch(() => {});
    await db.delete(user).where(eq(user.id, uid)).catch(() => {});
  });
});