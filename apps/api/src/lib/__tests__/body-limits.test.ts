import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { config } from "../../config.js";

// A body that body-parser refuses (too large, malformed, bad encoding) throws a plain Error
// carrying a `type` and a status rather than an AppError, so every one of them used to fall
// through to the generic branch of error-handler.ts and come back as:
//
//   {"error":"Internal server error","code":"INTERNAL_ERROR"}   HTTP 500
//
// That is what a patient saw when uploading a document, and it gave no hint that the request
// had simply exceeded the 100kb default limit. These pin the real statuses.

const app = createApp();

describe("body parser failures are reported as themselves, not as 500s", () => {
  it("returns 413 for a body over the standard route limit", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      // Over the 1mb standard limit; /auth/login is deliberately not the upload route.
      .send(JSON.stringify({ email: "probe@test.local", password: "x".repeat(2 * 1024 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
    expect(res.status).not.toBe(500);
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "broken", ');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
    expect(res.body.error).toMatch(/valid JSON/i);
  });

  it("still accepts a normal-sized body on the same route", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "probe@test.local", password: "password123" });

    // 401 (bad credentials) is the point — the body parsed fine and the route ran.
    expect(res.status).toBe(401);
  });
});

describe("upload body budget", () => {
  // The upload route needs a bigger budget than everything else precisely because base64
  // inflates the payload; deriving it from maxUploadBytes keeps the two from drifting apart,
  // which is what would silently reintroduce "file within the limit, rejected by the parser".
  it("allows for base64 inflation over the raw file limit", () => {
    expect(config.maxUploadBodyBytes).toBeGreaterThan(config.maxUploadBytes * 4 / 3);
  });
});
