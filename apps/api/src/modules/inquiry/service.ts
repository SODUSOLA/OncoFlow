import crypto from "node:crypto";

// The raw token is shown once at creation and only its SHA-256 hash is stored.
export function generateAccessToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

// Returns the SHA-256 hex hash of an access token.
export function hashAccessToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Compares a token to its stored hash in constant time.
export function verifyAccessToken(token: string, storedHash: string): boolean {
  const candidateHash = Buffer.from(hashAccessToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (candidateHash.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidateHash, stored);
}
