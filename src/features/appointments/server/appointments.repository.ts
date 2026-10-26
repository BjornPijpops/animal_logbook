import { scopeDb, type Tenant } from "@/db/scope";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { appointments } from "@/db/schema";
import type { AppointmentType } from "../schemas";

export type AppointmentRow = typeof appointments.$inferSelect;
export type AppointmentValues = {
  animalId: string | null;
  type: AppointmentType;
  title: string;
  scheduledAt: Date;
  timezone: string;
  costMinor: number | null;
  currency: string | null;
  notes: string | null;
  followUpDate: string | null;
};

export function createAppointmentsRepository(executor: DbExecutor, tenant: Tenant) {
  const db = scopeDb(executor, tenant);
  const { householdId } = tenant;
  const inHousehold = eq(appointments.householdId, householdId);
  const live = and(inHousehold, isNull(appointments.deletedAt));

  return {
    async insert(values: AppointmentValues, createdBy: string): Promise<AppointmentRow> {
      const [row] = await db
        .insert(appointments)
        .values({ ...values, householdId, createdBy })
        .returning();
      if (!row) throw new Error("appointment insert failed");
      return row;
    },

    async find(id: string): Promise<AppointmentRow | null> {
      const [row] = await db
        .select()
        .from(appointments)
        .where(and(live, eq(appointments.id, id)));
      return row ?? null;
    },

    async findDeleted(id: string): Promise<AppointmentRow | null> {
      const [row] = await db
        .select()
        .from(appointments)
        .where(and(inHousehold, eq(appointments.id, id), isNotNull(appointments.deletedAt)));
      return row ?? null;
    },

    async update(id: string, values: AppointmentValues): Promise<AppointmentRow | null> {
      const [row] = await db
        .update(appointments)
        .set(values)
        .where(and(live, eq(appointments.id, id)))
        .returning();
      return row ?? null;
    },

    async softDelete(id: string, at: Date): Promise<boolean> {
      const rows = await db
        .update(appointments)
        .set({ deletedAt: at })
        .where(and(live, eq(appointments.id, id)))
        .returning({ id: appointments.id });
      return rows.length > 0;
    },

    async restore(id: string): Promise<AppointmentRow | null> {
      const [row] = await db
        .update(appointments)
        .set({ deletedAt: null })
        .where(and(inHousehold, eq(appointments.id, id), isNotNull(appointments.deletedAt)))
        .returning();
      return row ?? null;
    },
  };
}
