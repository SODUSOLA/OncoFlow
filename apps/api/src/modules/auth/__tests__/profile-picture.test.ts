import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "node:crypto";
import { createApp } from "../../../app.js";
import { db } from "../../../db/index.js";
import { user, session } from "../schema.js";
import { file } from "../../documents/schema.js";
import { SESSION_COOKIE_NAME } from "../../../lib/session-cookie.js";

const app = createApp();
let me: { id: string; cookie: string };
let other: { id: string };

async function makeUser() {
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, email: `pfp-${crypto.randomUUID()}@test.com`, passwordHash: "test" });
  const sid = crypto.randomUUID();
  await db.insert(session).values({ id: sid, userId: id, device: "test", ip: "127.0.0.1", expiresAt: new Date(Date.now() + 30 * 60_000), mfaVerified: true });
  return { id, cookie: `${SESSION_COOKIE_NAME}=${sid}` };
}
async function makeFile(uploadedBy: string, opts: { mime?: string; status?: "CLEAN" | "PENDING" } = {}) {
  const id = crypto.randomUUID();
  await db.insert(file).values({ id, uploadedBy, storageKey: `test/${id}`, mimeType: opts.mime ?? "image/png", virusScanStatus: opts.status ?? "CLEAN", fileHash: crypto.randomUUID() });
  return id;
}

beforeAll(async () => { me = await makeUser(); other = await makeUser(); });

describe("PUT /auth/profile/picture", () => {
  it("sets your own clean image and returns it on the profile", async () => {
    const fileId = await makeFile(me.id);
    const res = await request(app).put("/auth/profile/picture").set("Cookie", me.cookie).send({ fileId });
    expect(res.status).toBe(200);
    expect(res.body.user.profilePictureFileId).toBe(fileId);
    const profile = await request(app).get("/auth/profile").set("Cookie", me.cookie);
    expect(profile.body.user.profilePictureFileId).toBe(fileId);
  });

  it("refuses someone else's file, a non-image, and a file that hasn't cleared the scan", async () => {
    const put = (fileId: string) => request(app).put("/auth/profile/picture").set("Cookie", me.cookie).send({ fileId });
    expect((await put(await makeFile(other.id))).status).toBe(400);
    expect((await put(await makeFile(me.id, { mime: "application/pdf" }))).status).toBe(400);
    expect((await put(await makeFile(me.id, { status: "PENDING" }))).status).toBe(400);
  });
});
