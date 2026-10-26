import { and, eq, isNull } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { files } from "@/db/schema";

export type FileRow = {
  id: string;
  householdId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
};

const columns = {
  id: files.id,
  householdId: files.householdId,
  storageKey: files.storageKey,
  mimeType: files.mimeType,
  sizeBytes: files.sizeBytes,
  checksumSha256: files.checksumSha256,
};

export function createFilesRepository(db: DbExecutor, householdId: string) {
  return {
    async insert(input: Omit<FileRow, "householdId"> & { uploadedBy: string }): Promise<void> {
      await db.insert(files).values({ ...input, householdId });
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
