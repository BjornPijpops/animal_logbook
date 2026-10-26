import { sql } from "drizzle-orm";
import {
  boolean,
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
import { households } from "./households";

export const appointmentType = pgEnum("appointment_type", [
  "vet",
  "grooming",
  "training",
  "vaccination",
  "medication",
]);

export const medicalRecordType = pgEnum("medical_record_type", [
  "vaccination",
  "surgery",
  "illness",
  "injury",
  "allergy",
  "medication",
]);

export const severity = pgEnum("severity", ["mild", "moderate", "severe"]);

export const expenseCategory = pgEnum("expense_category", [
  "vet",
  "food",
  "insurance",
  "grooming",
  "toys",
  "medication",
  "other",
]);

export const reminderSource = pgEnum("reminder_source", [
  "follow_up",
  "vaccination_due",
  "medication_dose",
  "document_expiry",
  "low_stock",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const householdColumn = () =>
  uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" });

const createdBy = () => uuid("created_by").references(() => users.id, { onDelete: "set null" });

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    animalId: uuid("animal_id"),
    type: appointmentType("type").notNull(),
    title: text("title").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    // Zone the user entered the time in, kept so the original wall-clock time can be shown later.
    timezone: text("timezone").notNull(),
    costMinor: integer("cost_minor"),
    currency: char("currency", { length: 3 }),
    notes: text("notes"),
    followUpDate: date("follow_up_date", { mode: "string" }),
    createdBy: createdBy(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("appointments_id_household_key").on(t.id, t.householdId),
    foreignKey({
      columns: [t.animalId, t.householdId],
      foreignColumns: [animals.id, animals.householdId],
    }),
    check(
      "appointments_cost_check",
      sql`(${t.costMinor} is null) = (${t.currency} is null) and (${t.costMinor} is null or ${t.costMinor} >= 0)`,
    ),
    index("appointments_household_time_idx")
      .on(t.householdId, t.scheduledAt.desc())
      .where(sql`${t.deletedAt} is null`),
    index("appointments_animal_time_idx").on(t.householdId, t.animalId, t.scheduledAt.desc()),
  ],
);

export const medicalRecords = pgTable(
  "medical_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    animalId: uuid("animal_id").notNull(),
    type: medicalRecordType("type").notNull(),
    // Vaccine, procedure, diagnosis, injury, allergen or medication name depending on the type.
    title: text("title").notNull(),
    startedOn: date("started_on", { mode: "string" }).notNull(),
    endedOn: date("ended_on", { mode: "string" }),
    severity: severity("severity"),
    nextDueOn: date("next_due_on", { mode: "string" }),
    notes: text("notes"),
    appointmentId: uuid("appointment_id"),
    importedFromProfile: boolean("imported_from_profile").notNull().default(false),
    createdBy: createdBy(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("medical_records_id_household_key").on(t.id, t.householdId),
    foreignKey({
      columns: [t.animalId, t.householdId],
      foreignColumns: [animals.id, animals.householdId],
    }),
    foreignKey({
      columns: [t.appointmentId, t.householdId],
      foreignColumns: [appointments.id, appointments.householdId],
    }),
    check(
      "medical_records_dates_check",
      sql`${t.endedOn} is null or ${t.endedOn} >= ${t.startedOn}`,
    ),
    check(
      "medical_records_typed_check",
      sql`(${t.nextDueOn} is null or ${t.type} = 'vaccination')
        and (${t.severity} is null or ${t.type} in ('illness', 'injury', 'allergy'))
        and (${t.endedOn} is null or ${t.type} not in ('vaccination', 'surgery'))`,
    ),
    index("medical_records_animal_idx")
      .on(t.householdId, t.animalId, t.startedOn.desc())
      .where(sql`${t.deletedAt} is null`),
    index("medical_records_appointment_idx").on(t.householdId, t.appointmentId),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    animalId: uuid("animal_id"),
    category: expenseCategory("category").notNull(),
    incurredOn: date("incurred_on", { mode: "string" }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    description: text("description").notNull(),
    // At most one expense per appointment keeps appointment costs from being counted twice.
    appointmentId: uuid("appointment_id"),
    createdBy: createdBy(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
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
    check("expenses_amount_check", sql`${t.amountMinor} >= 0`),
    index("expenses_household_date_idx")
      .on(t.householdId, t.incurredOn.desc())
      .where(sql`${t.deletedAt} is null`),
  ],
);

// Household-wide: recipients are resolved at delivery time, so members who join later are covered.
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    sourceType: reminderSource("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    animalId: uuid("animal_id"),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    // Set instead of delivering when the reminder is older than the stale window.
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("reminders_source_due_key").on(t.sourceType, t.sourceId, t.dueAt),
    foreignKey({
      columns: [t.animalId, t.householdId],
      foreignColumns: [animals.id, animals.householdId],
    }),
    index("reminders_due_idx")
      .on(t.dueAt)
      .where(sql`${t.doneAt} is null and ${t.cancelledAt} is null and ${t.expiredAt} is null`),
    index("reminders_source_idx").on(t.householdId, t.sourceType, t.sourceId),
  ],
);
