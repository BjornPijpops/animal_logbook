import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { attachmentOwnerType, attachments, files } from "@/db/schema";

export const ATTACHMENT_OWNER_TYPES = attachmentOwnerType.enumValues;
export type AttachmentOwnerType = (typeof ATTACHMENT_OWNER_TYPES)[number];
export type AttachmentOwner = { type: AttachmentOwnerType; id: string };

export type AttachmentView = {
  id: string;
  fileId: string;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
};

export function createAttachmentsRepository(db: DbExecutor, householdId: string) {
  const live = (owner: AttachmentOwner) =>
    and(
      eq(attachments.householdId, householdId),
      eq(attachments.ownerType, owner.type),
      eq(attachments.ownerId, owner.id),
      isNull(attachments.deletedAt),
      isNull(files.deletedAt),
    );

  return {
    async insert(owner: AttachmentOwner, fileId: string): Promise<void> {
      await db
        .insert(attachments)
        .values({ householdId, ownerType: owner.type, ownerId: owner.id, fileId });
    },

    async list(owner: AttachmentOwner): Promise<AttachmentView[]> {
      return db
        .select({
          id: attachments.id,
          fileId: attachments.fileId,
          originalName: files.originalName,
          mimeType: files.mimeType,
          sizeBytes: files.sizeBytes,
          createdAt: attachments.createdAt,
        })
        .from(attachments)
        .innerJoin(files, and(eq(files.id, attachments.fileId), eq(files.householdId, householdId)))
        .where(live(owner))
        .orderBy(asc(attachments.createdAt), asc(attachments.id));
    },

    async find(owner: AttachmentOwner, attachmentId: string): Promise<AttachmentView | null> {
      const rows = await this.list(owner);
      return rows.find((row) => row.id === attachmentId) ?? null;
    },

    // Marks attachments and their files deleted together; returns the file ids affected.
    async softDelete(owner: AttachmentOwner, attachmentIds?: string[]): Promise<string[]> {
      const rows = await db
        .select({ id: attachments.id, fileId: attachments.fileId })
        .from(attachments)
        .where(
          and(
            eq(attachments.householdId, householdId),
            eq(attachments.ownerType, owner.type),
            eq(attachments.ownerId, owner.id),
            isNull(attachments.deletedAt),
            ...(attachmentIds ? [inArray(attachments.id, attachmentIds)] : []),
          ),
        );
      if (rows.length === 0) return [];
      const now = new Date();
      await db
        .update(attachments)
        .set({ deletedAt: now })
        .where(
          and(
            eq(attachments.householdId, householdId),
            inArray(
              attachments.id,
              rows.map((r) => r.id),
            ),
          ),
        );
      const fileIds = rows.map((r) => r.fileId);
      await db
        .update(files)
        .set({ deletedAt: now })
        .where(and(eq(files.householdId, householdId), inArray(files.id, fileIds)));
      return fileIds;
    },
  };
}
