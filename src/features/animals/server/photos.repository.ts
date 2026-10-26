import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { animalPhotos, files } from "@/db/schema";

export type PhotoRow = {
  id: string;
  animalId: string;
  fileId: string;
  thumbFileId: string;
  width: number;
  height: number;
  isPrimary: boolean;
};

const columns = {
  id: animalPhotos.id,
  animalId: animalPhotos.animalId,
  fileId: animalPhotos.fileId,
  thumbFileId: animalPhotos.thumbFileId,
  width: animalPhotos.width,
  height: animalPhotos.height,
  isPrimary: animalPhotos.isPrimary,
};

export function createPhotosRepository(db: DbExecutor, householdId: string) {
  const live = and(eq(animalPhotos.householdId, householdId), isNull(animalPhotos.deletedAt));

  return {
    async listForAnimal(animalId: string): Promise<PhotoRow[]> {
      return db
        .select(columns)
        .from(animalPhotos)
        .where(and(live, eq(animalPhotos.animalId, animalId)))
        .orderBy(desc(animalPhotos.isPrimary), asc(animalPhotos.createdAt), asc(animalPhotos.id));
    },

    async find(animalId: string, photoId: string): Promise<PhotoRow | null> {
      const [row] = await db
        .select(columns)
        .from(animalPhotos)
        .where(and(live, eq(animalPhotos.animalId, animalId), eq(animalPhotos.id, photoId)));
      return row ?? null;
    },

    async insert(
      input: Omit<PhotoRow, "id" | "isPrimary"> & { isPrimary: boolean },
    ): Promise<void> {
      await db.insert(animalPhotos).values({ ...input, householdId });
    },

    async clearPrimary(animalId: string): Promise<void> {
      await db
        .update(animalPhotos)
        .set({ isPrimary: false })
        .where(and(live, eq(animalPhotos.animalId, animalId), eq(animalPhotos.isPrimary, true)));
    },

    async setPrimary(animalId: string, photoId: string): Promise<void> {
      await db
        .update(animalPhotos)
        .set({ isPrimary: true })
        .where(and(live, eq(animalPhotos.animalId, animalId), eq(animalPhotos.id, photoId)));
    },

    async softDelete(animalId: string, photoId: string): Promise<void> {
      await db
        .update(animalPhotos)
        .set({ deletedAt: new Date(), isPrimary: false })
        .where(and(live, eq(animalPhotos.animalId, animalId), eq(animalPhotos.id, photoId)));
    },

    async storageKeys(fileIds: string[]): Promise<string[]> {
      const keys: string[] = [];
      for (const id of fileIds) {
        const [row] = await db
          .select({ key: files.storageKey })
          .from(files)
          .where(and(eq(files.householdId, householdId), eq(files.id, id)));
        if (row) keys.push(row.key);
      }
      return keys;
    },
  };
}
