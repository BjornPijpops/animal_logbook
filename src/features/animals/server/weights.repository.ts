import { and, desc, eq, isNull } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { weightEntries } from "@/db/schema";

export type WeightRow = {
  id: string;
  animalId: string;
  measuredAt: Date;
  weightGrams: number;
  note: string | null;
};

const columns = {
  id: weightEntries.id,
  animalId: weightEntries.animalId,
  measuredAt: weightEntries.measuredAt,
  weightGrams: weightEntries.weightGrams,
  note: weightEntries.note,
};

export function createWeightsRepository(db: DbExecutor, householdId: string) {
  const live = and(eq(weightEntries.householdId, householdId), isNull(weightEntries.deletedAt));

  return {
    async listForAnimal(animalId: string): Promise<WeightRow[]> {
      return db
        .select(columns)
        .from(weightEntries)
        .where(and(live, eq(weightEntries.animalId, animalId)))
        .orderBy(desc(weightEntries.measuredAt), desc(weightEntries.createdAt));
    },

    async insert(input: {
      animalId: string;
      measuredAt: Date;
      weightGrams: number;
      note: string | null;
      createdBy: string;
    }): Promise<WeightRow> {
      const [row] = await db
        .insert(weightEntries)
        .values({ ...input, householdId })
        .returning(columns);
      if (!row) throw new Error("weight insert returned no row");
      return row;
    },

    async softDelete(animalId: string, entryId: string): Promise<boolean> {
      const rows = await db
        .update(weightEntries)
        .set({ deletedAt: new Date() })
        .where(and(live, eq(weightEntries.animalId, animalId), eq(weightEntries.id, entryId)))
        .returning({ id: weightEntries.id });
      return rows.length > 0;
    },
  };
}
