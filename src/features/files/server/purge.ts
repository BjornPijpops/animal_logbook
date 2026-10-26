import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { animalPhotos, attachments, documents, files } from "@/db/schema";
import type { StorageAdapter } from "@/lib/storage/types";

export type PurgeOptions = {
  now: Date;
  retentionDays: number;
  // Protects uploads that are still in flight (bytes stored, transaction not yet committed).
  orphanGraceHours?: number;
  batchSize?: number;
};

export type PurgeReport = { documents: number; files: number; strayBytes: number };

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const MAX_BATCHES = 1000;

// A system-wide maintenance job, so it deliberately works across households. Every step only
// deletes what is already unreachable (soft-deleted past retention, or referenced by nothing),
// and re-running it finds nothing left to do.
export async function purgeFiles(
  deps: { db: Database; storage: StorageAdapter },
  options: PurgeOptions,
): Promise<PurgeReport> {
  const { db, storage } = deps;
  const batchSize = options.batchSize ?? 100;
  const retentionCutoff = new Date(options.now.getTime() - options.retentionDays * DAY);
  const graceCutoff = new Date(options.now.getTime() - (options.orphanGraceHours ?? 24) * HOUR);
  const report: PurgeReport = { documents: 0, files: 0, strayBytes: 0 };

  for (let i = 0; i < MAX_BATCHES; i++) {
    const expired = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(isNotNull(documents.deletedAt), lt(documents.deletedAt, retentionCutoff)))
      .limit(batchSize);
    if (expired.length === 0) break;
    const ids = expired.map((d) => d.id);
    await db.transaction(async (tx) => {
      await tx
        .delete(attachments)
        .where(and(eq(attachments.ownerType, "document"), inArray(attachments.ownerId, ids)));
      await tx.delete(documents).where(inArray(documents.id, ids));
    });
    report.documents += ids.length;
  }

  const livePhoto = (column: typeof animalPhotos.fileId | typeof animalPhotos.thumbFileId) =>
    sql`exists (select 1 from ${animalPhotos} where ${column} = ${files.id} and ${animalPhotos.deletedAt} is null)`;
  const liveAttachment = sql`exists (select 1 from ${attachments} where ${attachments.fileId} = ${files.id} and ${attachments.deletedAt} is null)`;

  for (let i = 0; i < MAX_BATCHES; i++) {
    const doomed = await db
      .select({ id: files.id, storageKey: files.storageKey })
      .from(files)
      .where(
        or(
          and(isNotNull(files.deletedAt), lt(files.deletedAt, retentionCutoff)),
          and(
            isNull(files.deletedAt),
            lt(files.createdAt, graceCutoff),
            sql`not ${livePhoto(animalPhotos.fileId)}`,
            sql`not ${livePhoto(animalPhotos.thumbFileId)}`,
            sql`not ${liveAttachment}`,
          ),
        ),
      )
      .limit(batchSize);
    if (doomed.length === 0) break;
    const ids = doomed.map((f) => f.id);
    // Bytes first: if the row delete fails, the next run retries the same files.
    for (const file of doomed) await storage.delete(file.storageKey);
    await db.transaction(async (tx) => {
      await tx
        .delete(animalPhotos)
        .where(or(inArray(animalPhotos.fileId, ids), inArray(animalPhotos.thumbFileId, ids)));
      await tx.delete(attachments).where(inArray(attachments.fileId, ids));
      await tx.delete(files).where(inArray(files.id, ids));
    });
    report.files += ids.length;
  }

  const stored = (await storage.list()).filter((s) => s.modifiedAt < graceCutoff);
  for (let i = 0; i < stored.length; i += 500) {
    const chunk = stored.slice(i, i + 500);
    const known = await db
      .select({ key: files.storageKey })
      .from(files)
      .where(
        inArray(
          files.storageKey,
          chunk.map((s) => s.key),
        ),
      );
    const knownKeys = new Set(known.map((k) => k.key));
    for (const item of chunk) {
      if (knownKeys.has(item.key)) continue;
      await storage.delete(item.key);
      report.strayBytes += 1;
    }
  }

  return report;
}
