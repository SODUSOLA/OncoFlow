import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { getRedis } from "./redis.js";
import { RateLimitError } from "./errors.js";
import { config } from "../config.js";

// Every request in a test run originates from 127.0.0.1, so without this all 47 suites share
// one bucket per limiter — and because counters live in Redis for the full 15-minute window,
// they also survive *between* runs. That made failures depend on how recently the suite last
// ran: consecutive full runs produced 4, then 12, then more spurious 429s as counters piled up.
// Namespacing per process gives each vitest worker its own buckets, so limiter behaviour is
// still fully exercised within a file but never leaks across files or across runs.
// Empty in production and development — real deployments must share buckets across requests,
// which is the entire point of a rate limiter.
const KEY_NAMESPACE = config.isTest ? `test:${process.pid}:${crypto.randomBytes(4).toString("hex")}:` : "";

type RateLimitConfig = {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyGenerator?: (req: Request) => string;
};

type MemoryBucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();

function getDefaultKey(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedIp = typeof forwardedFor === "string" ? forwardedFor.split(",")[0]?.trim() : undefined;
  return forwardedIp ?? req.ip ?? "unknown";
}

function setRateLimitHeaders(res: Response, limit: number, remaining: number, resetAt: number): void {
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(remaining, 0)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
}

async function consumeRedis(key: string, windowMs: number, max: number) {
  const redis = getRedis();
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, windowMs);
  }

  const ttl = await redis.pttl(key);
  const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
  return {
    allowed: count <= max,
    remaining: max - count,
    resetAt,
  };
}

function consumeMemory(key: string, windowMs: number, max: number) {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    memoryBuckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: max - 1,
      resetAt,
    };
  }

  existing.count += 1;
  return {
    allowed: existing.count <= max,
    remaining: max - existing.count,
    resetAt: existing.resetAt,
  };
}

export function createRateLimiter({ windowMs, max, keyPrefix, keyGenerator }: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `${KEY_NAMESPACE}${keyPrefix}:${keyGenerator?.(req) ?? getDefaultKey(req)}`;

    try {
      const result = await consumeRedis(key, windowMs, max);
      setRateLimitHeaders(res, max, result.remaining, result.resetAt);
      if (!result.allowed) {
        next(new RateLimitError("Too many requests", { retryAfterSeconds: Math.ceil((result.resetAt - Date.now()) / 1000) }));
        return;
      }
      next();
    } catch {
      const result = consumeMemory(key, windowMs, max);
      setRateLimitHeaders(res, max, result.remaining, result.resetAt);
      if (!result.allowed) {
        next(new RateLimitError("Too many requests", { retryAfterSeconds: Math.ceil((result.resetAt - Date.now()) / 1000) }));
        return;
      }
      next();
    }
  };
}

