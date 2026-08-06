import crypto from "node:crypto";

// The raw token is shown to the visitor exactly once (on inquiry creation) and stored in
// their browser — the server only ever keeps its SHA-256 hash, same principle as a password.
export function generateAccessToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function hashAccessToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function verifyAccessToken(token: string, storedHash: string): boolean {
  const candidateHash = Buffer.from(hashAccessToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (candidateHash.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidateHash, stored);
}
