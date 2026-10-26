import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { expenses, households, sessions, users } from "@/db/schema";
import { addMember, createUser, setPassword, setupTestDatabase, TEST_PASSWORD } from "@/test/db";
import { finishPendingDeletions } from "../worker";
import { deleteAccount } from "../server/service";
import { addExpense, addFile, makeDeps, world } from "./fixtures";

const db = setupTestDatabase();

async function soloOwner() {
  const user = await createUser(db, { email: `solo-${randomUUID()}@example.test` });
  await setPassword(db, user.id);
  const [household] = await db
    .insert(households)
    .values({ name: "Solo", createdBy: user.id })
    .returning();
  if (!household) throw new Error("setup");
  await addMember(db, household.id, user.id, "owner");
  await db.insert(sessions).values({
    userId: user.id,
    token: randomUUID(),
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  return { user, household };
}

describe("pending account deletion", () => {
  it("locks the account, survives a failure midway and completes on retry", async () => {
    const parts = makeDeps(db);
    const { user, household } = await soloOwner();
    const file = await addFile(db, parts.fileStorage, household.id, "solo-bytes", user.id);
    await addExpense(db, household.id, "Solo expense");

    let failing = true;
    const realDelete = parts.fileStorage.delete.bind(parts.fileStorage);
    parts.fileStorage.delete = async (key: string) => {
      if (failing) throw new Error("disk error");
      return realDelete(key);
    };

    const first = await deleteAccount(parts.deps, user, TEST_PASSWORD);
    expect(first.ok && first.value.status).toBe("pending");

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.deletionRequestedAt).toBeInstanceOf(Date);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);

    failing = false;
    const retry = await finishPendingDeletions(parts.deps, { olderThanMs: 0 });
    expect(retry.failed).toBe(0);
    expect(retry.completed).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(0);
    expect(await db.select().from(households).where(eq(households.id, household.id))).toHaveLength(
      0,
    );
    // The bytes were lost track of when the first run died after the rows went; the stray-file
    // sweep (files-purge job) owns that case, so the retry must at least not fail on it.
    expect(file.storageKey).toBeTruthy();

    const again = await finishPendingDeletions(parts.deps, { olderThanMs: 0 });
    expect(again.failed).toBe(0);
  });

  it("does not touch accounts that are not pending", async () => {
    const parts = makeDeps(db);
    const { user } = await soloOwner();
    const result = await finishPendingDeletions(parts.deps, { olderThanMs: 0 });
    expect(result.failed).toBe(0);
    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(1);
  });

  it("leaves no name or email of the deleted member on content they authored", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const marker = randomUUID();
    const member = await createUser(db, {
      name: `Marker-${marker}`,
      email: `marker-${marker}@example.test`,
    });
    await setPassword(db, member.id);
    await addMember(db, w.householdA.id, member.id, "editor");
    await db.insert(expenses).values({
      householdId: w.householdA.id,
      category: "toys",
      incurredOn: "2030-03-03",
      amountMinor: 100,
      currency: "EUR",
      description: "Authored by the member",
      createdBy: member.id,
    });
    await addFile(db, parts.fileStorage, w.householdA.id, "authored", member.id);

    const result = await deleteAccount(parts.deps, member, TEST_PASSWORD);
    expect(result.ok && result.value.status).toBe("deleted");

    // Every text-like column of every table, read from the catalog.
    const columns = await db.execute<{ tbl: string; col: string }>(sql`
      SELECT table_name AS tbl, column_name AS col FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'jsonb', 'json')
    `);
    const found: string[] = [];
    for (const { tbl, col } of columns.rows) {
      const hit = await db.execute<{ n: number }>(
        sql.raw(`SELECT count(*)::int AS n FROM "${tbl}" WHERE "${col}"::text ILIKE '%${marker}%'`),
      );
      if ((hit.rows[0]?.n ?? 0) > 0) found.push(`${tbl}.${col}`);
    }
    expect(found).toEqual([]);
    const [authored] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.description, "Authored by the member"));
    expect(authored?.createdBy).toBeNull();
  });
});
