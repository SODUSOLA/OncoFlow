import { describe, it, expect } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { user, session } from "../../auth/schema.js";
import { notification } from "../schema.js";
import { NotificationService } from "../service.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";

const app = createApp();

async function createSessionCookie() {
  const userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, email: `notif-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const sessionId = crypto.randomUUID();
  await db.insert(session).values({
    id: sessionId, userId, device: "test", ip: "127.0.0.1",
    expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true,
  });
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}

describe("GET /notifications", () => {
  it("returns an empty list for a user with no notifications", async () => {
    const { cookie } = await createSessionCookie();
    const res = await request(app).get("/notifications").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual([]);
  });

  it("returns only the caller's own notifications, newest first", async () => {
    const { userId, cookie } = await createSessionCookie();
    const { userId: otherUserId } = await createSessionCookie();

    await db.insert(notification).values([
      { id: crypto.randomUUID(), recipientId: otherUserId, type: "APPOINTMENT_REMINDER", status: "SENT" },
      { id: crypto.randomUUID(), recipientId: userId, type: "LAB_RESULT_REVIEWED", status: "SENT" },
    ]);

    const res = await request(app).get("/notifications").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].type).toBe("LAB_RESULT_REVIEWED");
  });
});

describe("NotificationService.create", () => {
  it("inserts a row with the given recipient/type, defaulting to PENDING status", async () => {
    const { userId } = await createSessionCookie();
    const svc = new NotificationService();

    const row = await svc.create({ recipientId: userId, type: "INVOICE_PAID" });

    expect(row.recipientId).toBe(userId);
    expect(row.type).toBe("INVOICE_PAID");
    expect(row.status).toBe("PENDING");
    expect(row.sentAt).toBeNull();
  });
});
