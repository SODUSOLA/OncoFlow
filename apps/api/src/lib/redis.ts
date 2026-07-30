import { Redis } from "ioredis";
import { config } from "../config.js";

let client: Redis | null = null;

export function getRedis(): Redis {
  client ??= new Redis(config.redisUrl, {
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