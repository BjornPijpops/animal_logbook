import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { scopeDb } from "@/db/scope";
import {
  auditLog,
  dataExports,
  files,
  householdInvites,
  householdMembers,
  households,
  sessions,
  users,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import type { StorageAdapter } from "@/lib/storage/types";

// Worker-safe: no Next.js, React or server-only imports. The web request marks the account as
// pending and tries to finish; the worker finishes whatever a failed attempt left behind.
export type DeletionDeps = {
  db: Database;
  fileStorage: StorageAdapter;
  exportStorage: StorageAdapter;
};

export type CompletionOutcome = "deleted" | "blocked" | "gone";

type Membership = { householdId: string; role: string };

async function membershipsOf(db: Database, userId: string): Promise<Membership[]> {
  return scopeDb(db, { userId })
    .select({ householdId: householdMembers.householdId, role: householdMembers.role })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId));
}

// Deletes the household row (everything under it cascades) and then the bytes it owned. Keys are
// collected first; if the process dies between the two steps the stray-file sweeps remove the bytes.
export async function deleteHouseholdRows(
  deps: DeletionDeps,
  tenant: { householdId: string; userId: string },
): Promise<void> {
  const scoped = scopeDb(deps.db, tenant);
  const fileKeys = (
    await scoped
      .select({ key: files.storageKey })
      .from(files)
      .where(eq(files.householdId, tenant.householdId))
  ).map((row) => row.key);
  const exportKeys = (
    await scoped
      .select({ key: dataExports.storageKey })
      .from(dataExports)
      .where(
        and(eq(dataExports.householdId, tenant.householdId), eq(dataExports.userId, tenant.userId)),
      )
  ).flatMap((row) => (row.key ? [row.key] : []));

  await scoped.delete(households).where(eq(households.id, tenant.householdId));

  for (const key of fileKeys) await deps.fileStorage.delete(key);
  for (const key of exportKeys) await deps.exportStorage.delete(key);
}

// Marks the account as pending deletion and revokes every session in one transaction. From here
// on nobody can sign in, so a failed run can never leave a usable half-deleted account.
export async function markDeletionPending(db: Database, userId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ deletionRequestedAt: now })
      .where(and(eq(users.id, userId), sql`${users.deletionRequestedAt} is null`));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
}

// Idempotent: safe to run again after a partial failure. The blocked-owner rule is re-checked
// because membership can change between the request and the retry; the request is then cancelled.
export async function completeAccountDeletion(
  deps: DeletionDeps,
  userId: string,
): Promise<CompletionOutcome> {
  const [user] = await deps.db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return "gone";

  const memberships = await membershipsOf(deps.db, userId);
  for (const m of memberships) {
    if (m.role !== "owner") continue;
    const members = await scopeDb(deps.db, { userId, householdId: m.householdId })
      .select({ n: sql<number>`count(*)::int` })
      .from(householdMembers)
      .where(eq(householdMembers.householdId, m.householdId));
    if ((members[0]?.n ?? 0) > 1) {
      await deps.db.update(users).set({ deletionRequestedAt: null }).where(eq(users.id, userId));
      logger.warn("account deletion cancelled: household gained members");
      return "blocked";
    }
  }

  const exportKeys = (
    await scopeDb(deps.db, { userId })
      .select({ key: dataExports.storageKey })
      .from(dataExports)
      .where(and(eq(dataExports.userId, userId), isNotNull(dataExports.storageKey)))
  ).flatMap((row) => (row.key ? [row.key] : []));

  for (const m of memberships) {
    const tenant = { userId, householdId: m.householdId };
    if (m.role === "owner") {
      await deleteHouseholdRows(deps, tenant);
      continue;
    }
    await scopeDb(deps.db, tenant).transaction(async (tx) => {
      await tx.insert(auditLog).values({
        householdId: m.householdId,
        actorUserId: userId,
        event: "account_deleted",
      });
      await tx
        .delete(householdMembers)
        .where(
          and(eq(householdMembers.householdId, m.householdId), eq(householdMembers.userId, userId)),
        );
    });
  }

  await scopeDb(deps.db, { userId })
    .delete(householdInvites)
    .where(sql`lower(${householdInvites.email}) = ${user.email.toLowerCase()}`);
  // Sessions, accounts, push subscriptions, preferences, deliveries and exports cascade from here.
  await deps.db.delete(users).where(eq(users.id, userId));
  for (const key of exportKeys) await deps.exportStorage.delete(key);
  return "deleted";
}

// Worker job: finishes deletions a web request could not (crash, storage error, restart).
export async function finishPendingDeletions(
  deps: DeletionDeps,
  options: { olderThanMs?: number; now?: Date } = {},
): Promise<{ completed: number; failed: number }> {
  const cutoff = new Date((options.now ?? new Date()).getTime() - (options.olderThanMs ?? 60_000));
  const pending = await scopeDb(deps.db, {})
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.deletionRequestedAt), lt(users.deletionRequestedAt, cutoff)))
    .limit(50);
  let completed = 0;
  let failed = 0;
  for (const { id } of pending) {
    try {
      if ((await completeAccountDeletion(deps, id)) === "deleted") completed += 1;
    } catch (error) {
      failed += 1;
      logger.error({ err: error }, "pending account deletion failed, will retry");
    }
  }
  return { completed, failed };
}
