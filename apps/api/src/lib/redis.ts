import { Redis } from "ioredis";
import { config } from "../config.js";

let client: Redis | null = null;

// Returns the shared Redis client, creating it lazily with the "oncoflow:" key prefix.
export function getRedis(): Redis {
  client ??= new Redis(config.redisUrl, {
    lazyConnect: true,
    keyPrefix: "oncoflow:",
  });
  return client;
}

// Opens the shared Redis connection.
export async function connectRedis(): Promise<void> {
  const r = getRedis();
  if (r.status === "wait") {
    await r.connect();
  }
}

// Closes the shared Redis connection if one was opened.
export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}