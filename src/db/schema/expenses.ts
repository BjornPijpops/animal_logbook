import { sql } from "drizzle-orm";
import {
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { animals } from "./animals";
import { users } from "./auth";
import { appointments } from "./care";
import { households } from "./households";
import { foodPlans } from "./food";
import { medications } from "./medication";

export const expenseCategory = pgEnum("expense_category", [
  "vet",
  "food",
  "insurance",
  "grooming",
  "toys",
  "medication",
  "training",
  "other",
]);

// The only source for spending totals. Appointment costs are written here by the appointment
// service (one row per appointment); everything else is entered manually.
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    animalId: uuid("animal_id"),
    category: expenseCategory("category").notNull(),
    incurredOn: date("incurred_on", { mode: "string" }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    description: text("description").notNull(),
    notes: text("notes"),
    // At most one expense per appointment keeps appointment costs from being counted twice.
    appointmentId: uuid("appointment_id"),
    medicationId: uuid("medication_id"),
    // A purchase logged from a food plan. Plans are only soft-deleted, so the link survives.
    foodPlanId: uuid("food_plan_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("expenses_id_household_key").on(t.id, t.householdId),
    unique("expenses_appointment_key").on(t.appointmentId),
    foreignKey({
      columns: [t.animalId, t.householdId],
      foreignColumns: [animals.id, animals.householdId],
    }),
    foreignKey({
      columns: [t.appointmentId, t.householdId],
      foreignColumns: [appointments.id, appointments.householdId],
    }),
    foreignKey({
      columns: [t.medicationId, t.householdId],
      foreignColumns: [medications.id, medications.householdId],
    }),
    foreignKey({
      columns: [t.foodPlanId, t.householdId],
      foreignColumns: [foodPlans.id, foodPlans.householdId],
    }),
    check("expenses_amount_check", sql`${t.amountMinor} >= 0`),
    index("expenses_household_date_idx")
      .on(t.householdId, t.incurredOn.desc())
      .where(sql`${t.deletedAt} is null`),
  ],
);
