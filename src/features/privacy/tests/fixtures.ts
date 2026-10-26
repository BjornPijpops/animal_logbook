import { randomUUID } from "node:crypto";
import type { Database } from "@/db/client";
import { dataExports, expenses, files } from "@/db/schema";
import { seedAnimal, ctxFor } from "@/features/animals/tests/helpers";
import { createPostgresRateLimiter } from "@/lib/security/rate-limit";
import {
  addMember,
  createMemoryStorage,
  createUser,
  seedTwoHouseholds,
  setPassword,
} from "@/test/db";
import type { PrivacyDeps } from "../server/service";

export function makeDeps(db: Database, now?: () => Date) {
  const fileStorage = createMemoryStorage();
  const exportStorage = createMemoryStorage();
  const deps: PrivacyDeps = {
    db,
    limiter: createPostgresRateLimiter(db),
    fileStorage,
    exportStorage,
    exportTtlHours: 24,
    ...(now ? { now } : {}),
  };
  return { deps, fileStorage, exportStorage };
}

export async function addFile(
  db: Database,
  storage: { put(key: string, data: Buffer): Promise<void> },
  householdId: string,
  content: string,
  uploadedBy?: string,
) {
  const storageKey = `${householdId}/${randomUUID()}`;
  await storage.put(storageKey, Buffer.from(content));
  const [row] = await db
    .insert(files)
    .values({
      householdId,
      storageKey,
      mimeType: "image/png",
      sizeBytes: content.length,
      checksumSha256: "a".repeat(64),
      originalName: `${content}.png`,
      uploadedBy: uploadedBy ?? null,
    })
    .returning();
  if (!row) throw new Error("file insert failed");
  return row;
}

export async function addExpense(db: Database, householdId: string, description: string) {
  await db.insert(expenses).values({
    householdId,
    category: "food",
    incurredOn: "2030-01-01",
    amountMinor: 1234,
    currency: "EUR",
    description,
  });
}

// Household A has an owner, an editor and a viewer; household B belongs to somebody else and
// holds data that must never show up in anything A's users do or download.
export async function world(db: Database, storage: Parameters<typeof addFile>[1]) {
  const base = await seedTwoHouseholds(db);
  const editor = await createUser(db);
  const viewer = await createUser(db);
  await addMember(db, base.householdA.id, editor.id, "editor");
  await addMember(db, base.householdA.id, viewer.id, "viewer");
  for (const user of [base.ownerA, base.ownerB, editor, viewer]) await setPassword(db, user.id);

  const ctx = {
    owner: ctxFor(base.ownerA, base.householdA, "owner"),
    editor: ctxFor(editor, base.householdA, "editor"),
    viewer: ctxFor(viewer, base.householdA, "viewer"),
    ownerB: ctxFor(base.ownerB, base.householdB, "owner"),
  };
  await seedAnimal(db, ctx.owner, "Alpha-A");
  await seedAnimal(db, ctx.ownerB, "SECRET-B-ANIMAL");
  const fileA = await addFile(db, storage, base.householdA.id, "bytes-of-household-a");
  const fileB = await addFile(db, storage, base.householdB.id, "SECRET-B-FILE-BYTES");
  await addExpense(db, base.householdA.id, "Kibble A");
  await addExpense(db, base.householdB.id, "SECRET-B-EXPENSE");
  return { ...base, editor, viewer, ctx, fileA, fileB };
}

export async function insertReadyExport(
  db: Database,
  input: { userId: string; householdId: string; storageKey: string; expiresAt: Date },
) {
  const [row] = await db
    .insert(dataExports)
    .values({ ...input, status: "ready" })
    .returning();
  if (!row) throw new Error("export insert failed");
  return row;
}
