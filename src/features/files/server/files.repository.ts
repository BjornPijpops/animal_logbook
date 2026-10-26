import { scopeDb, type Tenant } from "@/db/scope";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { files } from "@/db/schema";

export type FileRow = {
  id: string;
  householdId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  originalName: string | null;
};

const columns = {
  id: files.id,
  householdId: files.householdId,
  storageKey: files.storageKey,
  mimeType: files.mimeType,
  sizeBytes: files.sizeBytes,
  checksumSha256: files.checksumSha256,
  originalName: files.originalName,
};

export function createFilesRepository(executor: DbExecutor, tenant: Tenant) {
  const db = scopeDb(executor, tenant);
  const { householdId } = tenant;
  return {
    async insert(
      input: Omit<FileRow, "householdId" | "originalName"> & {
        originalName?: string | null;
        uploadedBy: string;
      },
    ): Promise<void> {
      await db.insert(files).values({ ...input, householdId });
    },

    // Soft-deleted files no longer count; their bytes are reclaimed by the purge job.
    async usedBytes(): Promise<number> {
      const [row] = await db
        .select({ total: sql<string>`coalesce(sum(${files.sizeBytes}), 0)` })
        .from(files)
        .where(and(eq(files.householdId, householdId), isNull(files.deletedAt)));
      return Number(row?.total ?? 0);
    },

    async find(fileId: string): Promise<FileRow | null> {
      const [row] = await db
        .select(columns)
        .from(files)
        .where(
          and(eq(files.householdId, householdId), eq(files.id, fileId), isNull(files.deletedAt)),
        );
      return row ?? null;
    },

    async softDelete(fileIds: string[]): Promise<void> {
      for (const id of fileIds) {
        await db
          .update(files)
          .set({ deletedAt: new Date() })
          .where(and(eq(files.householdId, householdId), eq(files.id, id)));
      }
    },
  };
}
