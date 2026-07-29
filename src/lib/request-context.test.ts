import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { attachRequestContext } from "./request-context.js";
import { requirePermissionScoped } from "./rbac.js";
import { SESSION_COOKIE_NAME } from "./session-cookie.js";
import { closeRedis, connectRedis } from "./redis.js";

// Exercises the real cookie -> session -> user -> facilityId derivation path
// (request-context.ts) feeding into requirePermissionScoped's facility comparator,
// rather than a synthetic req.facilityId set directly by the test.
function createTestApp(resourceFacilityId: string) {
  const app = express();
  app.use(cookieParser());
  app.use(attachRequestContext);
  app.get(
    "/scoped",
    requirePermissionScoped("test.scoped", "read", () => resourceFacilityId),
    (_req, res) => res.json({ ok: true }),
  );
  return app;
}

let roleId: string;
let permissionId: string;
let facilityAId: string;
let facilityBId: string;
let userId: string;
let sessionId: string;

beforeAll(async () => {
  await connectRedis();
  const { role, permission, rolePermission, user, userRole, session } = await import("../modules/auth/schema.js");
  const { facility } = await import("../modules/facility/schema.js");

  roleId = crypto.randomUUID();
  await db.insert(role).values({ id: roleId, name: "ONSITE_NURSING_OFFICER", description: "Test" });

  permissionId = crypto.randomUUID();
  await db.insert(permission).values({ id: permissionId, resource: "test.scoped", action: "read", description: "Test" });
  await db.insert(rolePermission).values({ roleId, permissionId });

  facilityAId = crypto.randomUUID();
  facilityBId = crypto.randomUUID();
  await db.insert(facility).values([
    { id: facilityAId, name: "Facility A", region: "Test", address: "Test" },
    { id: facilityBId, name: "Facility B", region: "Test", address: "Test" },
  ]);

  userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    email: `scoped-${Date.now()}@example.com`,
    passwordHash: "test",
    facilityId: facilityAId,
  });
  await db.insert(userRole).values({ userId, roleId });

  sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId,
    userId,
    device: "test",
    ip: "127.0.0.1",
    // Generous window: beforeAll-to-request gap can be much longer than 60s under load.
    expiresAt: new Date(Date.now() + 30 * 60_000),
    mfaVerified: true,
  });
});

afterAll(async () => {
  const { permission, rolePermission } = await import("../modules/auth/schema.js");
  await db.delete(rolePermission).where(eq(rolePermission.permissionId, permissionId)).catch(() => {});
  await db.delete(permission).where(eq(permission.id, permissionId)).catch(() => {});
  await closeRedis();
});

it("derives facilityId from the session's user and allows a matching resource facility", async () => {
  const res = await request(createTestApp(facilityAId))
    .get("/scoped")
    .set("Cookie", `${SESSION_COOKIE_NAME}=${sessionId}`);
  expect(res.status).toBe(200);
});

it("denies when the derived facilityId doesn't match the resource's facility", async () => {
  const res = await request(createTestApp(facilityBId))
    .get("/scoped")
    .set("Cookie", `${SESSION_COOKIE_NAME}=${sessionId}`);
  expect(res.status).toBe(403);
});

it("returns 401 with no session cookie at all", async () => {
  const res = await request(createTestApp(facilityAId)).get("/scoped");
  expect(res.status).toBe(401);
});
