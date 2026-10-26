import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  char,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { households } from "./households";

export const animalGender = pgEnum("animal_gender", ["male", "female", "unknown"]);

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

// Species is a validated key (built-ins live in code); "other" plus free text is always allowed.
export const animals = pgTable(
  "animals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    name: text("name").notNull(),
    species: text("species").notNull(),
    speciesOther: text("species_other"),
    breed: text("breed"),
    gender: animalGender("gender").notNull().default("unknown"),
    birthDate: date("birth_date", { mode: "string" }),
    birthDateIsEstimate: boolean("birth_date_is_estimate").notNull().default(false),
    colorMarkings: text("color_markings"),
    chipNumber: text("chip_number"),
    registrationNumber: text("registration_number"),
    sterilized: boolean("sterilized"),
    emergencyNotes: text("emergency_notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("animals_id_household_key").on(t.id, t.householdId),
    index("animals_household_idx").on(t.householdId, t.deletedAt, t.name),
    check(
      "animals_species_other_check",
      sql`${t.species} <> 'other' or length(btrim(coalesce(${t.speciesOther}, ''))) > 0`,
    ),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: char("checksum_sha256", { length: 64 }).notNull(),
    originalName: text("original_name"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("files_id_household_key").on(t.id, t.householdId)],
);

export const animalPhotos = pgTable(
  "animal_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    animalId: uuid("animal_id").notNull(),
    fileId: uuid("file_id").notNull(),
    thumbFileId: uuid("thumb_file_id").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.animalId, t.householdId],
      foreignColumns: [animals.id, animals.householdId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.fileId, t.householdId],
      foreignColumns: [files.id, files.householdId],
    }),
    foreignKey({
      columns: [t.thumbFileId, t.householdId],
      foreignColumns: [files.id, files.householdId],
    }),
    uniqueIndex("animal_photos_primary_key")
      .on(t.animalId)
      .where(sql`${t.isPrimary} and ${t.deletedAt} is null`),
    index("animal_photos_animal_idx").on(t.animalId, t.createdAt),
  ],
);

export const weightEntries = pgTable(
  "weight_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: householdColumn(),
    animalId: uuid("animal_id").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    weightGrams: integer("weight_grams").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.animalId, t.householdId],
      foreignColumns: [animals.id, animals.householdId],
    }).onDelete("cascade"),
    check("weight_entries_positive", sql`${t.weightGrams} > 0`),
    index("weight_entries_animal_idx").on(t.animalId, t.measuredAt.desc()),
  ],
);
