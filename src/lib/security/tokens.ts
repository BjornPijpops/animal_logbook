import { createHash, randomBytes } from "node:crypto";

// Tokens are random and only their SHA-256 hash is stored, so a DB leak cannot be replayed.
export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
