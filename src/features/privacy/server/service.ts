import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { scopeDb } from "@/db/scope";
import { dataExports, files, households, householdInvites, users } from "@/db/schema";
import { createAuditRepository } from "@/features/audit";
import {
  can,
  createMembersRepository,
  listMembershipsForUser,
  type Ctx,
} from "@/features/households";
import { logger } from "@/lib/logger";
import { err, ok, type Result } from "@/lib/result";
import type { RateLimiter } from "@/lib/security/rate-limit";
import type { StorageAdapter } from "@/lib/storage/types";
import { STALE_AFTER_MS } from "./export-jobs";
import { confirmPassword } from "./reauth";

export type PrivacyDeps = {
  db: Database;
  limiter: RateLimiter;
  fileStorage: StorageAdapter;
  exportStorage: StorageAdapter;
  exportTtlHours: number;
  now?: () => Date;
};

export type ExportView = {
  id: string;
  status: string;
  requestedAt: Date;
  expiresAt: Date | null;
  sizeBytes: number | null;
};

const EXPORTS_PER_HOUR = 3;
const nowOf = (deps: PrivacyDeps) => (deps.now ?? (() => new Date()))();

export async function listExports(deps: PrivacyDeps, ctx: Ctx): Promise<ExportView[]> {
  return scopeDb(deps.db, ctx)
    .select({
      id: dataExports.id,
      status: dataExports.status,
      requestedAt: dataExports.requestedAt,
      expiresAt: dataExports.expiresAt,
      sizeBytes: dataExports.sizeBytes,
    })
    .from(dataExports)
    .where(and(eq(dataExports.userId, ctx.userId), eq(dataExports.householdId, ctx.householdId)))
    .orderBy(desc(dataExports.requestedAt))
    .limit(10);
}

export async function requestExport(
  deps: PrivacyDeps,
  ctx: Ctx,
  password: unknown,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:export")) return err("forbidden", "Not allowed");
  const limit = await deps.limiter.consume(`export:${ctx.userId}`, EXPORTS_PER_HOUR, 3600);
  if (!limit.allowed) return err("rate_limited", "Too many export requests, try again later");
  const confirmed = await confirmPassword(deps, ctx, password);
  if (!confirmed.ok) return confirmed;

  const now = nowOf(deps);
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const [active] = await tx
      .select({ id: dataExports.id })
      .from(dataExports)
      .where(
        and(
          eq(dataExports.userId, ctx.userId),
          sql`${dataExports.status} in ('pending', 'processing')`,
          sql`${dataExports.requestedAt} > ${new Date(now.getTime() - STALE_AFTER_MS)}`,
        ),
      );
    if (active) return err("conflict", "An export is already being prepared");
    const [created] = await tx
      .insert(dataExports)
      .values({ userId: ctx.userId, householdId: ctx.householdId, requestedAt: now })
      .returning({ id: dataExports.id });
    if (!created) throw new Error("export insert returned no row");
    await createAuditRepository(tx, ctx).record({
      event: "export_requested",
      actorUserId: ctx.userId,
    });
    return ok({ id: created.id });
  });
}

// Only the requester can fetch a zip, only while it is ready and unexpired, and only while they
// may still export from that household.
export async function getExportDownload(
  deps: PrivacyDeps,
  ctx: Ctx,
  exportId: string,
): Promise<Result<{ data: Buffer; filename: string }>> {
  if (!can(ctx.role, "data:export")) return err("forbidden", "Not allowed");
  const now = nowOf(deps);
  const [row] = await scopeDb(deps.db, ctx)
    .select()
    .from(dataExports)
    .where(
      and(
        eq(dataExports.id, exportId),
        eq(dataExports.userId, ctx.userId),
        eq(dataExports.householdId, ctx.householdId),
      ),
    );
  if (!row || row.status !== "ready" || !row.storageKey || !row.expiresAt || row.expiresAt <= now) {
    return err("not_found", "Export not found or expired");
  }
  const data = await deps.exportStorage.get(row.storageKey);
  if (!data) return err("not_found", "Export not found or expired");
  await createAuditRepository(deps.db, ctx).record({
    event: "export_downloaded",
    actorUserId: ctx.userId,
  });
  return ok({ data, filename: `animal-logbook-export-${now.toISOString().slice(0, 10)}.zip` });
}

// Deletes the household row (everything under it cascades) and then the bytes it owned. Keys are
// collected first; if the process dies between the two steps the stray-file sweeps remove the bytes.
async function deleteHouseholdData(deps: PrivacyDeps, ctx: Ctx): Promise<void> {
  const scoped = scopeDb(deps.db, ctx);
  const fileKeys = (
    await scoped
      .select({ key: files.storageKey })
      .from(files)
      .where(eq(files.householdId, ctx.householdId))
  ).map((row) => row.key);
  const exportKeys = (
    await scoped
      .select({ key: dataExports.storageKey })
      .from(dataExports)
      .where(and(eq(dataExports.householdId, ctx.householdId), eq(dataExports.userId, ctx.userId)))
  ).flatMap((row) => (row.key ? [row.key] : []));

  await scoped.delete(households).where(eq(households.id, ctx.householdId));

  for (const key of fileKeys) await deps.fileStorage.delete(key);
  for (const key of exportKeys) await deps.exportStorage.delete(key);
}

export async function deleteHousehold(
  deps: PrivacyDeps,
  ctx: Ctx,
  password: unknown,
): Promise<Result<null>> {
  if (!can(ctx.role, "household:delete")) return err("forbidden", "Not allowed");
  const confirmed = await confirmPassword(deps, ctx, password);
  if (!confirmed.ok) return confirmed;
  await deleteHouseholdData(deps, ctx);
  logger.info({ householdId: ctx.householdId }, "household deleted");
  return ok(null);
}

export type DeleteAccountOutcome =
  { status: "deleted" } | { status: "blocked"; households: string[] };

// Rules: a sole owner of a household that still has other members must transfer ownership or delete
// the household first. A non-owner member just leaves. A sole owner of a one-person household
// deletes it. Content the user wrote in shared households stays, with the author cleared.
export async function deleteAccount(
  deps: PrivacyDeps,
  user: { id: string; email: string },
  password: unknown,
): Promise<Result<DeleteAccountOutcome>> {
  const memberships = await listMembershipsForUser(deps.db, user.id);
  const contexts: Ctx[] = memberships.map((m) => ({ ...m, userId: user.id }));

  const confirmed = await confirmPassword(
    deps,
    { userId: user.id, householdId: contexts[0]?.householdId ?? null },
    password,
  );
  if (!confirmed.ok) return confirmed;

  const blocked: string[] = [];
  for (const ctx of contexts) {
    if (ctx.role !== "owner") continue;
    if ((await createMembersRepository(deps.db, ctx).list()).length > 1) {
      blocked.push(ctx.householdName);
    }
  }
  for (const ctx of contexts) {
    await createAuditRepository(deps.db, ctx).record({
      event: "account_deletion_requested",
      actorUserId: user.id,
    });
  }
  if (blocked.length > 0) return ok({ status: "blocked", households: blocked });

  const exportKeys = (
    await scopeDb(deps.db, { userId: user.id })
      .select({ key: dataExports.storageKey })
      .from(dataExports)
      .where(eq(dataExports.userId, user.id))
  ).flatMap((row) => (row.key ? [row.key] : []));

  for (const ctx of contexts) {
    if (ctx.role === "owner") {
      await deleteHouseholdData(deps, ctx);
      continue;
    }
    await scopeDb(deps.db, ctx).transaction(async (tx) => {
      await createAuditRepository(tx, ctx).record({
        event: "account_deleted",
        actorUserId: user.id,
      });
      await createMembersRepository(tx, ctx).remove(user.id);
    });
  }

  await scopeDb(deps.db, { userId: user.id })
    .delete(householdInvites)
    .where(sql`lower(${householdInvites.email}) = ${user.email.toLowerCase()}`);
  // Sessions, accounts, push subscriptions, preferences, deliveries and exports cascade from here.
  await deps.db.delete(users).where(eq(users.id, user.id));
  for (const key of exportKeys) await deps.exportStorage.delete(key);

  logger.info("account deleted");
  return ok({ status: "deleted" });
}
