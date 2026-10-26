import { createHash } from "node:crypto";
import type { RateLimiter } from "@/lib/security/rate-limit";

type Rule = { scope: string; limit: number; windowSeconds: number };

// Per-account limits sit next to Better Auth's per-IP limit. They matter most when no proxy is
// trusted and every caller shares one IP bucket: one noisy client then cannot lock everyone out,
// and one account cannot be brute-forced from many addresses. The trade-off is that someone who
// knows an email can slow sign-ins for that account for one window.
const RULES: Record<string, Rule> = {
  "/sign-in/email": { scope: "signin", limit: 10, windowSeconds: 600 },
  "/request-password-reset": { scope: "reset", limit: 5, windowSeconds: 3600 },
};

export const LIMITED_PATHS = Object.keys(RULES);

// Hashed so the limiter table never stores email addresses.
export const accountKey = (scope: string, email: string) =>
  `acct:${scope}:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;

export async function accountAllowed(
  limiter: RateLimiter,
  path: string,
  body: unknown,
): Promise<boolean> {
  const rule = RULES[path];
  if (!rule) return true;
  const email =
    typeof body === "object" && body !== null && "email" in body && typeof body.email === "string"
      ? body.email
      : null;
  if (!email) return true;
  const result = await limiter.consume(
    accountKey(rule.scope, email),
    rule.limit,
    rule.windowSeconds,
  );
  return result.allowed;
}
