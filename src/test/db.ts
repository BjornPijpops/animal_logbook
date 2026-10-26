import { randomUUID } from "node:crypto";
import { afterAll } from "vitest";
import { createDatabase, type Database } from "@/db/client";
import { householdMembers, households, users } from "@/db/schema";
import type { Mailer, EmailMessage } from "@/lib/notify/email";
import type { StorageAdapter } from "@/lib/storage/types";

type Role = "owner" | "editor" | "viewer";

export function setupTestDatabase(): Database {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const { db, pool } = createDatabase(url);
  afterAll(async () => {
    await pool.end();
  });
  return db;
}

export async function createUser(
  db: Database,
  overrides: { name?: string; email?: string; emailVerified?: boolean } = {},
) {
  const id = randomUUID();
  const [user] = await db
    .insert(users)
    .values({
      name: overrides.name ?? "Test User",
      email: overrides.email ?? `${id}@example.test`,
      emailVerified: overrides.emailVerified ?? true,
    })
    .returning();
  if (!user) throw new Error("user insert failed");
  return user;
}

export async function createHousehold(db: Database, ownerId: string, name = "Test household") {
  const [household] = await db.insert(households).values({ name, createdBy: ownerId }).returning();
  if (!household) throw new Error("household insert failed");
  await db
    .insert(householdMembers)
    .values({ householdId: household.id, userId: ownerId, role: "owner" });
  return household;
}

export async function addMember(db: Database, householdId: string, userId: string, role: Role) {
  await db.insert(householdMembers).values({ householdId, userId, role });
}

// Standing fixture for tenant-isolation tests: two unrelated households, each with an owner.
// Every repository added in later phases must be exercised against it.
export async function seedTwoHouseholds(db: Database) {
  const ownerA = await createUser(db, { name: "Owner A" });
  const ownerB = await createUser(db, { name: "Owner B" });
  const householdA = await createHousehold(db, ownerA.id, "Household A");
  const householdB = await createHousehold(db, ownerB.id, "Household B");
  return { ownerA, ownerB, householdA, householdB };
}

export function createMemoryStorage(): StorageAdapter & {
  keys(): string[];
  setModifiedAt(key: string, date: Date): void;
} {
  const store = new Map<string, Buffer>();
  const modified = new Map<string, Date>();
  return {
    keys: () => [...store.keys()],
    setModifiedAt: (key, date) => modified.set(key, date),
    async list() {
      return [...store.keys()].map((key) => ({ key, modifiedAt: modified.get(key) ?? new Date() }));
    },
    async put(key, data) {
      store.set(key, data);
      modified.set(key, new Date());
    },
    async get(key) {
      return store.get(key) ?? null;
    },
    async delete(key) {
      store.delete(key);
    },
    async exists(key) {
      return store.has(key);
    },
  };
}

export function createFakeMailer(): Mailer & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}
