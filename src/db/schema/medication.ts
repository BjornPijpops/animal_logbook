import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { animals } from "./animals";
import { users } from "./auth";
import { medicalRecords, reminders } from "./care";
import { households } from "./households";

export const scheduleKind = pgEnum("schedule_kind", [
  "daily",
  "weekdays",
  "every_n_days",
  "as_needed",
]);
export const doseStatus = pgEnum("dose_status", ["given", "skipped", "missed"]);
export const notificationChannelType = pgEnum("notification_channel", ["push", "email"]);
export const deliveryStatus = pgEnum("delivery_status", ["pending", "sending", "sent", "failed"]);

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

// Name, start/end dates and notes live on the linked medication medical record (one source of
// truth); this row only adds what a record cannot express.
export const medications = pgTable(
  "medications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    animalId: uuid("animal_id").notNull(),
    medicalRecordId: uuid("medical_record_id").notNull(),
    dosage: text("dosage").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("medications_id_household_key").on(t.id, t.householdId),
    unique("medications_record_key").on(t.medicalRecordId),
    foreignKey({
      columns: [t.animalId, t.householdId],
      foreignColumns: [animals.id, animals.householdId],
    }),
    foreignKey({
      columns: [t.medicalRecordId, t.householdId],
      foreignColumns: [medicalRecords.id, medicalRecords.householdId],
    }),
    index("medications_animal_idx")
      .on(t.householdId, t.animalId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

// One schedule per medication. Times are household-local "HH:MM"; weekdays are ISO 1 (Mon) to 7.
export const medicationSchedules = pgTable(
  "medication_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    medicationId: uuid("medication_id").notNull(),
    kind: scheduleKind("kind").notNull(),
    times: text("times")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    weekdays: smallint("weekdays")
      .array()
      .notNull()
      .default(sql`'{}'::smallint[]`),
    intervalDays: integer("interval_days"),
    ...timestamps,
  },
  (t) => [
    unique("medication_schedules_medication_key").on(t.medicationId),
    foreignKey({
      columns: [t.medicationId, t.householdId],
      foreignColumns: [medications.id, medications.householdId],
    }),
    check(
      "medication_schedules_shape_check",
      sql`(${t.kind} = 'as_needed' and cardinality(${t.times}) = 0)
        or (${t.kind} <> 'as_needed' and cardinality(${t.times}) between 1 and 12)`,
    ),
    check(
      "medication_schedules_weekdays_check",
      sql`(${t.kind} = 'weekdays') = (cardinality(${t.weekdays}) > 0)`,
    ),
    check(
      "medication_schedules_interval_check",
      sql`(${t.kind} = 'every_n_days') = (${t.intervalDays} is not null)
        and (${t.intervalDays} is null or ${t.intervalDays} between 2 and 365)`,
    ),
  ],
);

// The unique (medication, scheduled_at) key is what makes a double tap a no-op. As-needed doses
// use the time they were logged as scheduled_at.
export const medicationDoses = pgTable(
  "medication_doses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    medicationId: uuid("medication_id").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: doseStatus("status").notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
    // Null for doses the worker marked as missed.
    loggedBy: uuid("logged_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
  },
  (t) => [
    unique("medication_doses_slot_key").on(t.medicationId, t.scheduledAt),
    foreignKey({
      columns: [t.medicationId, t.householdId],
      foreignColumns: [medications.id, medications.householdId],
    }),
    index("medication_doses_lookup_idx").on(t.householdId, t.medicationId, t.scheduledAt.desc()),
  ],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reminderId: uuid("reminder_id")
      .notNull()
      .references(() => reminders.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: notificationChannelType("channel").notNull(),
    status: deliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("notification_deliveries_key").on(t.reminderId, t.userId, t.channel),
    index("notification_deliveries_due_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.status} in ('pending', 'sending')`),
  ],
);

// Per device and per user: a subscription belongs to the person who enabled push, not the household.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("push_subscriptions_endpoint_key").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: notificationChannelType("channel").notNull(),
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channel] })],
);
