import { scopeDb, type Tenant } from "@/db/scope";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { animals, attachments, documents, files } from "@/db/schema";
import type { DocumentType } from "../schemas";

export type DocumentRow = typeof documents.$inferSelect;
export type DocumentValues = {
  type: DocumentType;
  title: string;
  notes: string | null;
  expiresOn: string | null;
  animalId: string | null;
};
export type DocumentListItem = DocumentRow & {
  animalName: string | null;
  fileName: string | null;
  fileMime: string | null;
  fileId: string | null;
};
export type DocumentFilter = {
  q: string;
  animal: string;
  type: DocumentType | "";
  expiringBefore: string | null;
  limit: number;
  offset: number;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export function createDocumentsRepository(executor: DbExecutor, tenant: Tenant) {
  const db = scopeDb(executor, tenant);
  const { householdId } = tenant;
  const live = and(eq(documents.householdId, householdId), isNull(documents.deletedAt));

  return {
    async insert(values: DocumentValues, createdBy: string, id?: string): Promise<DocumentRow> {
      const [row] = await db
        .insert(documents)
        .values({ ...values, ...(id ? { id } : {}), householdId, createdBy })
        .returning();
      if (!row) throw new Error("document insert failed");
      return row;
    },

    async find(id: string): Promise<DocumentRow | null> {
      const [row] = await db
        .select()
        .from(documents)
        .where(and(live, eq(documents.id, id)));
      return row ?? null;
    },

    async update(id: string, values: DocumentValues): Promise<DocumentRow | null> {
      const [row] = await db
        .update(documents)
        .set(values)
        .where(and(live, eq(documents.id, id)))
        .returning();
      return row ?? null;
    },

    async softDelete(id: string): Promise<boolean> {
      const rows = await db
        .update(documents)
        .set({ deletedAt: new Date() })
        .where(and(live, eq(documents.id, id)))
        .returning({ id: documents.id });
      return rows.length > 0;
    },

    async animalExists(animalId: string): Promise<boolean> {
      const [row] = await db
        .select({ id: animals.id })
        .from(animals)
        .where(
          and(
            eq(animals.householdId, householdId),
            eq(animals.id, animalId),
            isNull(animals.deletedAt),
          ),
        );
      return Boolean(row);
    },

    async list(filter: DocumentFilter): Promise<{ items: DocumentListItem[]; total: number }> {
      const needle = filter.q === "" ? null : `%${escapeLike(filter.q)}%`;
      const where = and(
        live,
        filter.animal === ""
          ? undefined
          : filter.animal === "household"
            ? isNull(documents.animalId)
            : eq(documents.animalId, filter.animal),
        filter.type === "" ? undefined : eq(documents.type, filter.type),
        filter.expiringBefore
          ? and(isNotNull(documents.expiresOn), lte(documents.expiresOn, filter.expiringBefore))
          : undefined,
        needle
          ? or(
              ilike(documents.title, needle),
              ilike(documents.notes, needle),
              sql`exists (select 1 from ${attachments} join ${files} on ${files.id} = ${attachments.fileId} where ${attachments.ownerType} = 'document' and ${attachments.ownerId} = ${documents.id} and ${attachments.householdId} = ${householdId} and ${files.originalName} ilike ${needle})`,
            )
          : undefined,
      );

      const [count] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(documents)
        .where(where);
      const rows = await db
        .select({ doc: documents, animalName: animals.name })
        .from(documents)
        .leftJoin(
          animals,
          and(eq(animals.id, documents.animalId), eq(animals.householdId, householdId)),
        )
        .where(where)
        .orderBy(desc(documents.createdAt), desc(documents.id))
        .limit(filter.limit)
        .offset(filter.offset);

      const ids = rows.map((r) => r.doc.id);
      const attached = ids.length
        ? await db
            .select({
              ownerId: attachments.ownerId,
              fileId: files.id,
              name: files.originalName,
              mime: files.mimeType,
            })
            .from(attachments)
            .innerJoin(
              files,
              and(eq(files.id, attachments.fileId), eq(files.householdId, householdId)),
            )
            .where(
              and(
                eq(attachments.householdId, householdId),
                eq(attachments.ownerType, "document"),
                inArray(attachments.ownerId, ids),
                isNull(attachments.deletedAt),
                isNull(files.deletedAt),
              ),
            )
        : [];
      const firstFile = new Map(attached.map((a) => [a.ownerId, a]));

      return {
        total: count?.total ?? 0,
        items: rows.map(({ doc, animalName }) => {
          const file = firstFile.get(doc.id);
          return {
            ...doc,
            animalName,
            fileId: file?.fileId ?? null,
            fileName: file?.name ?? null,
            fileMime: file?.mime ?? null,
          };
        }),
      };
    },
  };
}
