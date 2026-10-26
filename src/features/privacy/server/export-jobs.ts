import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { scopeDb } from "@/db/scope";
import { dataExports } from "@/db/schema";
import { logger } from "@/lib/logger";
import type { StorageAdapter } from "@/lib/storage/types";
import { buildHouseholdExport } from "./export-build";

export type ExportJobDeps = {
  db: Database;
  exportStorage: StorageAdapter;
  fileStorage: StorageAdapter;
  ttlHours: number;
  now?: () => Date;
};

// A request that was claimed but never finished (worker crash) is given up on after this long.
export const STALE_AFTER_MS = 60 * 60 * 1000;
const EXPIRED_ROW_KEEP_DAYS = 7;

type Claimed = { id: string; user_id: string; household_id: string };

async function claimNext(db: Database): Promise<Claimed | null> {
  const result = await scopeDb(db, {}).execute<Claimed>(sql`
    UPDATE data_exports SET status = 'processing'
    WHERE id = (
      SELECT id FROM data_exports WHERE status = 'pending'
      ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, user_id, household_id
  `);
  return result.rows[0] ?? null;
}

// The claim is atomic, so two workers (or one worker run twice) never build the same export.
export async function processPendingExports(
  deps: ExportJobDeps,
): Promise<{ ready: number; failed: number }> {
  const db = scopeDb(deps.db, {});
  let ready = 0;
  let failed = 0;
  for (let claimed = await claimNext(deps.db); claimed; claimed = await claimNext(deps.db)) {
    const now = (deps.now ?? (() => new Date()))();
    const expiresAt = new Date(now.getTime() + deps.ttlHours * 3_600_000);
    const storageKey = `${claimed.user_id}/${claimed.id}`;
    try {
      const built = await buildHouseholdExport(
        { db: deps.db, fileStorage: deps.fileStorage, now },
        { householdId: claimed.household_id, userId: claimed.user_id },
      );
      await deps.exportStorage.delete(storageKey);
      await deps.exportStorage.put(storageKey, built.zip);
      await db
        .update(dataExports)
        .set({
          status: "ready",
          storageKey,
          sizeBytes: built.zip.byteLength,
          completedAt: now,
          expiresAt,
        })
        .where(eq(dataExports.id, claimed.id));
      ready += 1;
    } catch (error) {
      logger.error({ exportId: claimed.id, err: error }, "data export failed");
      await db
        .update(dataExports)
        .set({ status: "failed", completedAt: now, expiresAt })
        .where(eq(dataExports.id, claimed.id));
      failed += 1;
    }
  }
  return { ready, failed };
}

// Zips that no row points at (the household was deleted, or a crash lost the row) are removed
// once they are old enough that an in-flight build cannot own them.
async function sweepStrayExports(
  deps: Pick<ExportJobDeps, "db" | "exportStorage">,
  now: Date,
): Promise<number> {
  const referenced = new Set(
    (
      await scopeDb(deps.db, {})
        .select({ key: dataExports.storageKey })
        .from(dataExports)
        .where(isNotNull(dataExports.storageKey))
    ).map((row) => row.key),
  );
  let removed = 0;
  for (const entry of await deps.exportStorage.list()) {
    if (referenced.has(entry.key)) continue;
    if (now.getTime() - entry.modifiedAt.getTime() < STALE_AFTER_MS) continue;
    await deps.exportStorage.delete(entry.key);
    removed += 1;
  }
  return removed;
}

// Gives up on stuck requests, deletes expired zips from disk, and trims old bookkeeping rows.
export async function expireExports(
  deps: Pick<ExportJobDeps, "db" | "exportStorage" | "now">,
): Promise<{ stale: number; expired: number; removedRows: number; strayFiles: number }> {
  const db = scopeDb(deps.db, {});
  const now = (deps.now ?? (() => new Date()))();

  const stale = await db
    .update(dataExports)
    .set({ status: "failed", completedAt: now, expiresAt: now })
    .where(
      and(
        inArray(dataExports.status, ["pending", "processing"]),
        lt(dataExports.requestedAt, new Date(now.getTime() - STALE_AFTER_MS)),
      ),
    )
    .returning({ id: dataExports.id });

  const due = await db
    .select({ id: dataExports.id, storageKey: dataExports.storageKey })
    .from(dataExports)
    .where(and(inArray(dataExports.status, ["ready", "failed"]), lt(dataExports.expiresAt, now)));
  for (const row of due) {
    if (row.storageKey) await deps.exportStorage.delete(row.storageKey);
    await db
      .update(dataExports)
      .set({ status: "expired", storageKey: null })
      .where(eq(dataExports.id, row.id));
  }

  const removed = await db
    .delete(dataExports)
    .where(
      and(
        eq(dataExports.status, "expired"),
        lt(dataExports.expiresAt, new Date(now.getTime() - EXPIRED_ROW_KEEP_DAYS * 86_400_000)),
      ),
    )
    .returning({ id: dataExports.id });

  const strayFiles = await sweepStrayExports(deps, now);
  return { stale: stale.length, expired: due.length, removedRows: removed.length, strayFiles };
}
