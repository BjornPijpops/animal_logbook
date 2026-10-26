import { and, eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import type { Database } from "@/db/client";
import { accounts } from "@/db/schema";
import { createAuditRepository } from "@/features/audit";
import { err, ok, type Result } from "@/lib/result";
import type { RateLimiter } from "@/lib/security/rate-limit";

export type ReauthDeps = { db: Database; limiter: RateLimiter };
export type ReauthCtx = { userId: string; householdId: string | null };

const ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

// Sensitive actions (export, account deletion) re-check the password every time. There is no
// "recently confirmed" state to steal. Wrong attempts are rate limited per user and audited.
export async function confirmPassword(
  deps: ReauthDeps,
  ctx: ReauthCtx,
  password: unknown,
): Promise<Result<null>> {
  if (typeof password !== "string" || password.length === 0 || password.length > 1024) {
    return err("validation", "Password is required");
  }
  const limit = await deps.limiter.consume(`reauth:${ctx.userId}`, ATTEMPTS, WINDOW_SECONDS);
  if (!limit.allowed) return err("rate_limited", "Too many attempts, try again later");

  const [account] = await deps.db
    .select({ hash: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, ctx.userId), eq(accounts.providerId, "credential")));
  const valid = account?.hash ? await verifyPassword({ hash: account.hash, password }) : false;
  if (valid) return ok(null);

  if (ctx.householdId) {
    await createAuditRepository(deps.db, {
      householdId: ctx.householdId,
      userId: ctx.userId,
    }).record({ event: "reauth_failed", actorUserId: ctx.userId });
  }
  return err("forbidden", "Incorrect password");
}
