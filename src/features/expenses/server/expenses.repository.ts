import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { expenseCategory, expenses } from "@/db/schema";

export const EXPENSE_CATEGORIES = expenseCategory.enumValues;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type ExpenseRow = {
  id: string;
  animalId: string | null;
  category: ExpenseCategory;
  incurredOn: string;
  amountMinor: number;
  currency: string;
  description: string;
  appointmentId: string | null;
  deletedAt: Date | null;
};

export type LinkedExpenseInput = {
  appointmentId: string;
  animalId: string | null;
  category: ExpenseCategory;
  incurredOn: string;
  amountMinor: number;
  currency: string;
  description: string;
  createdBy: string;
};

const columns = {
  id: expenses.id,
  animalId: expenses.animalId,
  category: expenses.category,
  incurredOn: expenses.incurredOn,
  amountMinor: expenses.amountMinor,
  currency: expenses.currency,
  description: expenses.description,
  appointmentId: expenses.appointmentId,
  deletedAt: expenses.deletedAt,
};

export function createExpensesRepository(db: DbExecutor, householdId: string) {
  return {
    // One row per appointment (unique key); re-saving updates it and un-deletes it.
    async upsertForAppointment(input: LinkedExpenseInput): Promise<void> {
      await db
        .insert(expenses)
        .values({ householdId, ...input })
        .onConflictDoUpdate({
          target: expenses.appointmentId,
          set: {
            animalId: input.animalId,
            category: input.category,
            incurredOn: input.incurredOn,
            amountMinor: input.amountMinor,
            currency: input.currency,
            description: input.description,
            deletedAt: null,
          },
        });
    },

    async softDeleteForAppointment(appointmentId: string): Promise<void> {
      await db
        .update(expenses)
        .set({ deletedAt: sql`now()` })
        .where(
          and(
            eq(expenses.householdId, householdId),
            eq(expenses.appointmentId, appointmentId),
            isNull(expenses.deletedAt),
          ),
        );
    },

    async restoreForAppointment(appointmentId: string): Promise<void> {
      await db
        .update(expenses)
        .set({ deletedAt: null })
        .where(
          and(eq(expenses.householdId, householdId), eq(expenses.appointmentId, appointmentId)),
        );
    },

    async findByAppointment(appointmentId: string): Promise<ExpenseRow | null> {
      const [row] = await db
        .select(columns)
        .from(expenses)
        .where(
          and(eq(expenses.householdId, householdId), eq(expenses.appointmentId, appointmentId)),
        );
      return row ?? null;
    },

    // The single place totals come from: live expense rows only, so appointment costs are
    // counted once through their linked expense.
    async totals(range: { from: string; to: string }) {
      return db
        .select({
          category: expenses.category,
          currency: expenses.currency,
          totalMinor: sql<string>`sum(${expenses.amountMinor})`.mapWith(Number),
          count: sql<string>`count(*)`.mapWith(Number),
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.householdId, householdId),
            isNull(expenses.deletedAt),
            sql`${expenses.incurredOn} >= ${range.from} and ${expenses.incurredOn} <= ${range.to}`,
          ),
        )
        .groupBy(expenses.category, expenses.currency)
        .orderBy(expenses.category);
    },
  };
}
