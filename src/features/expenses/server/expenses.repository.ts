import { scopeDb, type Tenant } from "@/db/scope";
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { animals, expenseCategory, expenses, medications } from "@/db/schema";

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
  notes: string | null;
  appointmentId: string | null;
  medicationId: string | null;
  foodPlanId: string | null;
  deletedAt: Date | null;
};

export type ExpenseListRow = ExpenseRow & { animalName: string | null };

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

export type ManualExpenseValues = {
  animalId: string | null;
  category: ExpenseCategory;
  incurredOn: string;
  amountMinor: number;
  currency: string;
  description: string;
  notes: string | null;
  medicationId: string | null;
  foodPlanId?: string | null;
};

// `year` is a calendar year of the household-local `incurred_on` date; null means all years.
export type ExpenseFilter = {
  year: number | null;
  animalId: string | null;
  category: ExpenseCategory | null;
};

export type MonthTotal = { month: number; currency: string; totalMinor: number };
export type YearTotal = { year: number; currency: string; totalMinor: number };
export type CategoryTotal = {
  category: ExpenseCategory;
  currency: string;
  totalMinor: number;
  count: number;
};

const columns = {
  id: expenses.id,
  animalId: expenses.animalId,
  category: expenses.category,
  incurredOn: expenses.incurredOn,
  amountMinor: expenses.amountMinor,
  currency: expenses.currency,
  description: expenses.description,
  notes: expenses.notes,
  appointmentId: expenses.appointmentId,
  medicationId: expenses.medicationId,
  foodPlanId: expenses.foodPlanId,
  deletedAt: expenses.deletedAt,
};

// An expense counts only while it is not deleted and, for appointment costs, while its
// appointment is not deleted either. Everything that totals, lists or exports uses this.
const liveExpense = sql`${expenses.deletedAt} is null and (${expenses.appointmentId} is null or exists (
  select 1 from appointments a
  where a.id = ${expenses.appointmentId} and a.household_id = ${expenses.householdId} and a.deleted_at is null))`;

const yearOf = sql`extract(year from ${expenses.incurredOn})::int`;
const monthOf = sql`extract(month from ${expenses.incurredOn})::int`;
const sumMinor = sql<string>`sum(${expenses.amountMinor})`.mapWith(Number);

export function createExpensesRepository(executor: DbExecutor, tenant: Tenant) {
  const db = scopeDb(executor, tenant);
  const { householdId } = tenant;
  const scope = (filter: ExpenseFilter, withYear = true): SQL => {
    const parts: SQL[] = [eq(expenses.householdId, householdId), liveExpense];
    if (withYear && filter.year !== null) parts.push(sql`${yearOf} = ${filter.year}`);
    if (filter.animalId) parts.push(eq(expenses.animalId, filter.animalId));
    if (filter.category) parts.push(eq(expenses.category, filter.category));
    return and(...parts) ?? sql`true`;
  };

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

    async insertManual(values: ManualExpenseValues, createdBy: string): Promise<ExpenseRow> {
      const [row] = await db
        .insert(expenses)
        .values({ householdId, createdBy, ...values })
        .returning(columns);
      if (!row) throw new Error("expense insert returned no row");
      return row;
    },

    // Appointment-linked rows are never changed here; their amount belongs to the appointment.
    async updateManual(id: string, values: ManualExpenseValues): Promise<ExpenseRow | null> {
      const [row] = await db
        .update(expenses)
        .set(values)
        .where(
          and(
            eq(expenses.householdId, householdId),
            eq(expenses.id, id),
            isNull(expenses.appointmentId),
            isNull(expenses.deletedAt),
          ),
        )
        .returning(columns);
      return row ?? null;
    },

    async softDeleteManual(id: string, at: Date): Promise<boolean> {
      const rows = await db
        .update(expenses)
        .set({ deletedAt: at })
        .where(
          and(
            eq(expenses.householdId, householdId),
            eq(expenses.id, id),
            isNull(expenses.appointmentId),
            isNull(expenses.deletedAt),
          ),
        )
        .returning({ id: expenses.id });
      return rows.length > 0;
    },

    // Returns the deletion time so attachments deleted with the expense can be restored with it.
    async restoreManual(id: string): Promise<Date | null> {
      const [before] = await db
        .select({ deletedAt: expenses.deletedAt })
        .from(expenses)
        .where(
          and(
            eq(expenses.householdId, householdId),
            eq(expenses.id, id),
            isNull(expenses.appointmentId),
            isNotNull(expenses.deletedAt),
          ),
        );
      if (!before?.deletedAt) return null;
      await db
        .update(expenses)
        .set({ deletedAt: null })
        .where(and(eq(expenses.householdId, householdId), eq(expenses.id, id)));
      return before.deletedAt;
    },

    // Any state: the detail page shows deleted expenses with a restore button.
    async find(id: string): Promise<ExpenseListRow | null> {
      const [row] = await db
        .select({ ...columns, animalName: animals.name })
        .from(expenses)
        .leftJoin(animals, eq(animals.id, expenses.animalId))
        .where(and(eq(expenses.householdId, householdId), eq(expenses.id, id)));
      return row ?? null;
    },

    async listDeletedManual(): Promise<ExpenseListRow[]> {
      return db
        .select({ ...columns, animalName: animals.name })
        .from(expenses)
        .leftJoin(animals, eq(animals.id, expenses.animalId))
        .where(
          and(
            eq(expenses.householdId, householdId),
            isNull(expenses.appointmentId),
            isNotNull(expenses.deletedAt),
          ),
        )
        .orderBy(desc(expenses.deletedAt))
        .limit(50);
    },

    async list(
      filter: ExpenseFilter,
      page: { limit: number; offset: number },
    ): Promise<ExpenseListRow[]> {
      return db
        .select({ ...columns, animalName: animals.name })
        .from(expenses)
        .leftJoin(animals, eq(animals.id, expenses.animalId))
        .where(scope(filter))
        .orderBy(desc(expenses.incurredOn), desc(expenses.createdAt), desc(expenses.id))
        .limit(page.limit)
        .offset(page.offset);
    },

    async count(filter: ExpenseFilter): Promise<number> {
      const [row] = await db
        .select({ n: sql<string>`count(*)`.mapWith(Number) })
        .from(expenses)
        .where(scope(filter));
      return row?.n ?? 0;
    },

    // Aggregations: integer minor units summed in SQL, one bucket per currency (no conversion).
    async monthly(filter: ExpenseFilter): Promise<MonthTotal[]> {
      return db
        .select({
          month: monthOf.mapWith(Number),
          currency: expenses.currency,
          totalMinor: sumMinor,
        })
        .from(expenses)
        .where(scope(filter))
        .groupBy(monthOf, expenses.currency)
        .orderBy(monthOf, expenses.currency);
    },

    async yearly(filter: ExpenseFilter): Promise<YearTotal[]> {
      return db
        .select({ year: yearOf.mapWith(Number), currency: expenses.currency, totalMinor: sumMinor })
        .from(expenses)
        .where(scope(filter, false))
        .groupBy(yearOf, expenses.currency)
        .orderBy(yearOf, expenses.currency);
    },

    async byCategory(filter: ExpenseFilter): Promise<CategoryTotal[]> {
      return db
        .select({
          category: expenses.category,
          currency: expenses.currency,
          totalMinor: sumMinor,
          count: sql<string>`count(*)`.mapWith(Number),
        })
        .from(expenses)
        .where(scope(filter))
        .groupBy(expenses.category, expenses.currency)
        .orderBy(expenses.category, expenses.currency);
    },

    // Category totals for an inclusive range of local dates.
    async totals(range: { from: string; to: string }): Promise<CategoryTotal[]> {
      return db
        .select({
          category: expenses.category,
          currency: expenses.currency,
          totalMinor: sumMinor,
          count: sql<string>`count(*)`.mapWith(Number),
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.householdId, householdId),
            liveExpense,
            sql`${expenses.incurredOn} >= ${range.from} and ${expenses.incurredOn} <= ${range.to}`,
          ),
        )
        .groupBy(expenses.category, expenses.currency)
        .orderBy(expenses.category, expenses.currency);
    },

    async years(): Promise<number[]> {
      const rows = await db
        .selectDistinct({ year: yearOf.mapWith(Number) })
        .from(expenses)
        .where(and(eq(expenses.householdId, householdId), liveExpense))
        .orderBy(desc(yearOf));
      return rows.map((row) => row.year);
    },

    async medicationAnimal(medicationId: string): Promise<{ animalId: string } | null> {
      const [row] = await db
        .select({ animalId: medications.animalId })
        .from(medications)
        .where(
          and(
            eq(medications.householdId, householdId),
            eq(medications.id, medicationId),
            isNull(medications.deletedAt),
          ),
        );
      return row ?? null;
    },

    async animalExists(animalId: string): Promise<boolean> {
      const rows = await db
        .select({ id: animals.id })
        .from(animals)
        .where(
          and(
            eq(animals.householdId, householdId),
            eq(animals.id, animalId),
            isNull(animals.deletedAt),
          ),
        );
      return rows.length > 0;
    },
  };
}
