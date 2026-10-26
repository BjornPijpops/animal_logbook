import { sql } from "drizzle-orm";
import {
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { animals, files } from "./animals";
import { users } from "./auth";
import { households } from "./households";

export const documentType = pgEnum("document_type", [
  "registration",
  "vaccination",
  "insurance",
  "invoice",
  "passport",
  "other",
]);

// Appointments, medical records and expenses arrive in later phases; the owner check lives in
// the service layer because a polymorphic reference cannot carry a foreign key.
export const attachmentOwnerType = pgEnum("attachment_owner_type", [
  "document",
  "appointment",
  "medical_record",
  "expense",
]);

const householdColumn = () =>
  uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" });

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    animalId: uuid("animal_id"),
    type: documentType("type").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    expiresOn: date("expires_on", { mode: "string" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    unique("documents_id_household_key").on(t.id, t.householdId),
    foreignKey({
      columns: [t.animalId, t.householdId],
      foreignColumns: [animals.id, animals.householdId],
    }),
    index("documents_household_created_idx").on(t.householdId, t.createdAt.desc()),
    index("documents_animal_idx").on(t.householdId, t.animalId),
    index("documents_expiry_idx")
      .on(t.householdId, t.expiresOn)
      .where(sql`${t.expiresOn} is not null and ${t.deletedAt} is null`),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    ownerType: attachmentOwnerType("owner_type").notNull(),
    ownerId: uuid("owner_id").notNull(),
    fileId: uuid("file_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    unique("attachments_file_key").on(t.fileId),
    foreignKey({
      columns: [t.fileId, t.householdId],
      foreignColumns: [files.id, files.householdId],
    }),
    index("attachments_owner_idx").on(t.householdId, t.ownerType, t.ownerId),
  ],
);
