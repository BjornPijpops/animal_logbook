import { zipSync } from "fflate";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Database } from "@/db/client";
import { scopeDb } from "@/db/scope";
import {
  animalPhotos,
  animals,
  appointments,
  attachments,
  documents,
  expenses,
  files,
  foodMeals,
  foodPlans,
  householdMembers,
  households,
  medicalRecords,
  medicationDoses,
  medicationSchedules,
  medications,
  notificationPreferences,
  users,
  weightEntries,
} from "@/db/schema";
import type { StorageAdapter } from "@/lib/storage/types";

export const EXPORT_TOO_LARGE = "export_too_large";

export class ExportTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(EXPORT_TOO_LARGE);
  }
}

// Total size of the files an export would carry (soft-deleted files are not exported).
export async function exportedFileBytes(db: Database, householdId: string): Promise<number> {
  const [row] = await scopeDb(db, {})
    .select({ total: sql<number>`coalesce(sum(${files.sizeBytes}), 0)::float8` })
    .from(files)
    .where(and(eq(files.householdId, householdId), isNull(files.deletedAt)));
  return row?.total ?? 0;
}

export type ExportBuild = { zip: Buffer; fileCount: number; missingFiles: number };

const README = (generatedAt: string, householdName: string) => `Animal Logbook data export
===========================

Household: ${householdName}
Generated: ${generatedAt}

What is inside
--------------
data/*.json   One JSON file per kind of record (animals, appointments, medical records,
              medications, food plans, expenses, documents, ...). Dates are ISO 8601 in UTC.
              Money is stored in integer minor units (for example cents) plus a currency code.
files/        Every stored upload (photos, documents, receipts). data/files.json maps each
              file id to its path in this folder, its original name and its checksum.
profile.json  Your own account details and notification preferences.
members.json  Names and roles of the household members. Other members' email addresses are
              not included.

Not included
------------
Other people's accounts, sessions, push subscription keys, reminder delivery logs and the
audit log. Items you deleted that are still inside the retention period are included and carry
a deletedAt date.

This file contains personal and medical information about you and your animals. Keep it safe.
`;

function safeName(name: string | null): string {
  const cleaned = (name ?? "file").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return cleaned.slice(0, 80) || "file";
}

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}

// Every query below is filtered by householdId explicitly. Row-level security is a second line of
// defense, so an export must stay correct even when it runs as a role that can see every row.
export async function buildHouseholdExport(
  deps: { db: Database; fileStorage: StorageAdapter; now: Date; maxBytes: number },
  input: { householdId: string; userId: string },
): Promise<ExportBuild> {
  const db = scopeDb(deps.db, {});
  const { householdId, userId } = input;

  const [household] = await db.select().from(households).where(eq(households.id, householdId));
  const [profile] = await db
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
      timezone: users.timezone,
      weightUnit: users.weightUnit,
      defaultCurrency: users.defaultCurrency,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  const preferences = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  const members = await db
    .select({
      name: users.name,
      role: householdMembers.role,
      joinedAt: householdMembers.createdAt,
    })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, householdId));

  if ((await exportedFileBytes(deps.db, householdId)) > deps.maxBytes) {
    throw new ExportTooLargeError(deps.maxBytes);
  }

  const where = (table: { householdId: AnyPgColumn }) => eq(table.householdId, householdId);
  const fileRows = await db.select().from(files).where(where(files));

  const archive: Record<string, Uint8Array> = {};
  let missingFiles = 0;
  let fileCount = 0;
  const fileIndex: Record<string, unknown>[] = [];
  for (const file of fileRows) {
    const { storageKey, ...rest } = file;
    const entry: Record<string, unknown> = { ...rest, path: null };
    if (!file.deletedAt) {
      const bytes = await deps.fileStorage.get(storageKey);
      if (bytes) {
        const path = `files/${file.id}-${safeName(file.originalName)}`;
        // A view, not a copy: the zip is held in memory, so every extra copy counts.
        archive[path] = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        entry.path = path;
        fileCount += 1;
      } else {
        missingFiles += 1;
      }
    }
    fileIndex.push(entry);
  }

  const dataSets: Record<string, unknown> = {
    animals: await db.select().from(animals).where(where(animals)),
    "animal-photos": await db.select().from(animalPhotos).where(where(animalPhotos)),
    "weight-entries": await db.select().from(weightEntries).where(where(weightEntries)),
    appointments: await db.select().from(appointments).where(where(appointments)),
    "medical-records": await db.select().from(medicalRecords).where(where(medicalRecords)),
    medications: await db.select().from(medications).where(where(medications)),
    "medication-schedules": await db
      .select()
      .from(medicationSchedules)
      .where(where(medicationSchedules)),
    "medication-doses": await db.select().from(medicationDoses).where(where(medicationDoses)),
    "food-plans": await db.select().from(foodPlans).where(where(foodPlans)),
    "food-meals": await db.select().from(foodMeals).where(where(foodMeals)),
    expenses: await db.select().from(expenses).where(where(expenses)),
    documents: await db.select().from(documents).where(where(documents)),
    attachments: await db.select().from(attachments).where(where(attachments)),
    files: fileIndex,
  };
  for (const [name, rows] of Object.entries(dataSets)) {
    archive[`data/${name}.json`] = json(rows);
  }
  archive["household.json"] = json(household ?? null);
  archive["members.json"] = json(members);
  archive["profile.json"] = json({
    profile: profile ?? null,
    notificationPreferences: preferences,
  });
  archive["README.txt"] = new TextEncoder().encode(
    README(deps.now.toISOString(), household?.name ?? "Household"),
  );

  // Uploads are already compressed formats, so storing them is faster and no larger.
  const zipped = zipSync(archive, { level: 0 });
  const zip = Buffer.from(zipped.buffer, zipped.byteOffset, zipped.byteLength);
  return { zip, fileCount, missingFiles };
}
