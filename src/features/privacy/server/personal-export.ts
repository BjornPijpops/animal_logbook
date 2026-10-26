import { desc, eq, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import { scopeDb } from "@/db/scope";
import {
  auditLog,
  households,
  householdMembers,
  notificationPreferences,
  pushSubscriptions,
  sessions,
  users,
} from "@/db/schema";
import { createAuditRepository } from "@/features/audit";
import type { Ctx } from "@/features/households";
import { err, ok, type Result } from "@/lib/result";
import type { RateLimiter } from "@/lib/security/rate-limit";
import { confirmPassword } from "./reauth";

export type PersonalExportDeps = { db: Database; limiter: RateLimiter; now?: () => Date };

const PER_HOUR = 5;

// Every member can export their own personal data, which is separate from the owner-only
// household export. It holds the account itself and nothing that belongs to a household: no
// animals, records, files or other people's details. Push keys and session tokens are secrets, so
// they are left out; the endpoint and device description are what identify a device.
export async function exportPersonalData(
  deps: PersonalExportDeps,
  ctx: Ctx,
  password: unknown,
): Promise<Result<{ json: string; filename: string }>> {
  const limit = await deps.limiter.consume(`export-personal:${ctx.userId}`, PER_HOUR, 3600);
  if (!limit.allowed) return err("rate_limited", "Too many export requests, try again later");
  const confirmed = await confirmPassword(deps, ctx, password);
  if (!confirmed.ok) return confirmed;

  const now = (deps.now ?? (() => new Date()))();
  const db = scopeDb(deps.db, { userId: ctx.userId });

  const [account] = await db
    .select({
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      phone: users.phone,
      locale: users.locale,
      timezone: users.timezone,
      weightUnit: users.weightUnit,
      defaultCurrency: users.defaultCurrency,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, ctx.userId));
  const preferences = await db
    .select({
      channel: notificationPreferences.channel,
      enabled: notificationPreferences.enabled,
      updatedAt: notificationPreferences.updatedAt,
    })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, ctx.userId));
  const devices = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      userAgent: pushSubscriptions.userAgent,
      createdAt: pushSubscriptions.createdAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, ctx.userId));
  const signedIn = await db
    .select({
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(eq(sessions.userId, ctx.userId));
  const memberships = await db
    .select({
      household: households.name,
      role: householdMembers.role,
      joinedAt: householdMembers.createdAt,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, ctx.userId));
  const audit = await db
    .select({
      event: auditLog.event,
      detail: auditLog.detail,
      createdAt: auditLog.createdAt,
      asActor: eq(auditLog.actorUserId, ctx.userId),
    })
    .from(auditLog)
    .where(or(eq(auditLog.actorUserId, ctx.userId), eq(auditLog.targetUserId, ctx.userId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(1000);

  await createAuditRepository(deps.db, ctx).record({
    event: "export_requested",
    actorUserId: ctx.userId,
    detail: "personal",
  });

  const payload = {
    about:
      "Your personal data in Animal Logbook. It covers your account only. Household content " +
      "(animals, records, files) is exported by a household owner from Settings, Privacy. " +
      "Other people's details, push keys and session tokens are not included.",
    generatedAt: now.toISOString(),
    account: account ?? null,
    householdMemberships: memberships,
    notificationPreferences: preferences,
    pushDevices: devices,
    signedInSessions: signedIn,
    auditEntriesAboutYou: audit,
  };
  return ok({
    json: JSON.stringify(payload, null, 2),
    filename: `animal-logbook-my-data-${now.toISOString().slice(0, 10)}.json`,
  });
}
