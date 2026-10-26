import { scopeDb, type Tenant } from "@/db/scope";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { animalPhotos, animals } from "@/db/schema";

export type AnimalRow = typeof animals.$inferSelect;
export type AnimalValues = Omit<
  typeof animals.$inferInsert,
  "id" | "householdId" | "createdAt" | "updatedAt" | "deletedAt"
>;
export type AnimalListItem = AnimalRow & { thumbFileId: string | null };

export function createAnimalsRepository(executor: DbExecutor, tenant: Tenant) {
  const db = scopeDb(executor, tenant);
  const { householdId } = tenant;
  const mine = (id: string) =>
    and(eq(animals.householdId, householdId), eq(animals.id, id), isNull(animals.deletedAt));

  return {
    async list(): Promise<AnimalListItem[]> {
      const rows = await db
        .select({ animal: animals, thumbFileId: animalPhotos.thumbFileId })
        .from(animals)
        .leftJoin(
          animalPhotos,
          and(
            eq(animalPhotos.animalId, animals.id),
            eq(animalPhotos.householdId, animals.householdId),
            eq(animalPhotos.isPrimary, true),
            isNull(animalPhotos.deletedAt),
          ),
        )
        .where(and(eq(animals.householdId, householdId), isNull(animals.deletedAt)))
        .orderBy(asc(animals.name), asc(animals.id));
      return rows.map((r) => ({ ...r.animal, thumbFileId: r.thumbFileId }));
    },

    async find(id: string): Promise<AnimalRow | null> {
      const [row] = await db.select().from(animals).where(mine(id));
      return row ?? null;
    },

    async insert(values: AnimalValues): Promise<AnimalRow> {
      const [row] = await db
        .insert(animals)
        .values({ ...values, householdId })
        .returning();
      if (!row) throw new Error("animal insert returned no row");
      return row;
    },

    async update(id: string, values: AnimalValues): Promise<AnimalRow | null> {
      const [row] = await db.update(animals).set(values).where(mine(id)).returning();
      return row ?? null;
    },

    async softDelete(id: string): Promise<boolean> {
      const rows = await db
        .update(animals)
        .set({ deletedAt: new Date() })
        .where(mine(id))
        .returning({ id: animals.id });
      return rows.length > 0;
    },

    // Previously used free-text values, offered as suggestions so spelling stays consistent.
    async usedValues(): Promise<{ speciesOther: string[]; breeds: string[] }> {
      const base = and(eq(animals.householdId, householdId), isNull(animals.deletedAt));
      const [others, breeds] = await Promise.all([
        db
          .selectDistinct({ value: animals.speciesOther })
          .from(animals)
          .where(and(base, isNotNull(animals.speciesOther))),
        db
          .selectDistinct({ value: animals.breed })
          .from(animals)
          .where(and(base, isNotNull(animals.breed))),
      ]);
      const clean = (rows: { value: string | null }[]) =>
        rows.flatMap((r) => (r.value ? [r.value] : [])).sort((a, b) => a.localeCompare(b));
      return { speciesOther: clean(others), breeds: clean(breeds) };
    },
  };
}
