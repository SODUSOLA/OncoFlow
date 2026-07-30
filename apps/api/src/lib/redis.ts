import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

let client: Redis | null = null;

export function getRedis(): Redis {
  client ??= new Redis(redisUrl, {
    lazyConnect: true,
    keyPrefix: "oncoflow:",
  });
  return client;
}

export async function connectRedis(): Promise<void> {
  const r = getRedis();
  if (r.status === "wait") {
    await r.connect();
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}