import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { seedAnimal, ctxFor } from "@/features/animals/tests/helpers";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { TEST_APP_PASSWORD, TEST_WORKER_PASSWORD } from "@/test/roles";
import { roleUrl } from "./roles";
import { scopeDb } from "./scope";
import { animals, householdInvites, householdMembers, households, sessions } from "./schema";

const db = setupTestDatabase();
const url = process.env.TEST_DATABASE_URL ?? "";
const appPool = new Pool({ connectionString: roleUrl(url, "animal_app", TEST_APP_PASSWORD) });
const workerPool = new Pool({
  connectionString: roleUrl(url, "animal_worker", TEST_WORKER_PASSWORD),
});
afterAll(async () => {
  await Promise.all([appPool.end(), workerPool.end()]);
});

// Drizzle wraps driver errors, so the Postgres message is on the cause.
function isRlsViolation(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  const text = `${error instanceof Error ? error.message : ""} ${cause instanceof Error ? cause.message : ""}`;
  return text.includes("row-level security");
}

async function world() {
  const w = await seedTwoHouseholds(db);
  const animalA = await seedAnimal(db, ctxFor(w.ownerA, w.householdA, "owner"), "Alpha");
  const animalB = await seedAnimal(db, ctxFor(w.ownerB, w.householdB, "owner"), "Beta");
  const asA = scopeDb(db, { userId: w.ownerA.id, householdId: w.householdA.id });
  return { ...w, animalA, animalB, asA };
}

describe("row-level security: configuration", () => {
  it("forces RLS and defines a policy on every table that has a household_id", async () => {
    const result = await db.execute<{ table_name: string; forced: boolean; policies: number }>(sql`
      SELECT c.relname AS table_name, c.relforcerowsecurity AS forced,
             (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS policies
      FROM information_schema.columns col
      JOIN pg_class c ON c.relname = col.table_name AND c.relkind = 'r'
      WHERE col.table_schema = 'public' AND col.column_name = 'household_id'
        AND c.relnamespace = 'public'::regnamespace
    `);
    expect(result.rows.length).toBeGreaterThan(10);
    for (const row of result.rows) {
      expect(row.forced, `${row.table_name} must FORCE row level security`).toBe(true);
      expect(row.policies, `${row.table_name} needs policies`).toBeGreaterThanOrEqual(2);
    }
  });

  it("covers households, memberships and the user-scoped tables too", async () => {
    const result = await db.execute<{ relname: string }>(sql`
      SELECT relname FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relforcerowsecurity
    `);
    const names = result.rows.map((row) => row.relname);
    expect(names).toEqual(
      expect.arrayContaining([
        "households",
        "household_members",
        "household_invites",
        "push_subscriptions",
        "notification_preferences",
        "notification_deliveries",
      ]),
    );
  });
});

describe("row-level security: the database blocks what the repository filter would", () => {
  it("returns only the caller's household even when the query has no household filter", async () => {
    const w = await world();
    const rows = await w.asA.select({ id: animals.id }).from(animals);
    expect(rows.map((row) => row.id)).toEqual([w.animalA]);
  });

  it("cannot update or delete another household's rows, even with an unfiltered statement", async () => {
    const w = await world();
    const updated = await w.asA.update(animals).set({ name: "Hijacked" }).returning();
    expect(updated.map((row) => row.id)).toEqual([w.animalA]);
    const deleted = await w.asA.delete(animals).returning();
    expect(deleted.map((row) => row.id)).toEqual([w.animalA]);
    const [beta] = await db
      .select()
      .from(animals)
      .where(sql`${animals.id} = ${w.animalB}`);
    expect(beta?.name).toBe("Beta");
    expect(beta?.deletedAt).toBeNull();
  });

  it("rejects an insert for another household", async () => {
    const w = await world();
    await expect(
      w.asA.insert(animals).values({
        householdId: w.householdB.id,
        name: "Smuggled",
        species: "dog",
      }),
    ).rejects.toSatisfy(isRlsViolation);
  });

  it("returns nothing without context, and a bare insert fails", async () => {
    const w = await world();
    const bare = await appPool.query("SELECT id FROM animals");
    expect(bare.rowCount).toBe(0);
    // A household id alone is not enough: no user means no membership.
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.household_id', $1, true)", [w.householdA.id]);
      expect((await client.query("SELECT id FROM animals")).rowCount).toBe(0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    await expect(
      appPool.query("INSERT INTO animals (household_id, name, species) VALUES ($1, 'x', 'dog')", [
        w.householdA.id,
      ]),
    ).rejects.toSatisfy(isRlsViolation);
  });

  it("gives a user who is not a member of the household nothing, even with its id", async () => {
    const w = await world();
    const outsider = await createUser(db);
    const forged = scopeDb(db, { userId: outsider.id, householdId: w.householdA.id });
    expect(await forged.select().from(animals)).toHaveLength(0);
    await expect(
      forged.insert(animals).values({
        householdId: w.householdA.id,
        name: "Intruder",
        species: "dog",
      }),
    ).rejects.toSatisfy(isRlsViolation);
  });

  it("stops a member of two households from seeing the other one through the first", async () => {
    const w = await world();
    await addMember(db, w.householdB.id, w.ownerA.id, "viewer");
    const asA = scopeDb(db, { userId: w.ownerA.id, householdId: w.householdA.id });
    expect((await asA.select().from(animals)).map((row) => row.id)).toEqual([w.animalA]);
    const asAinB = scopeDb(db, { userId: w.ownerA.id, householdId: w.householdB.id });
    expect((await asAinB.select().from(animals)).map((row) => row.id)).toEqual([w.animalB]);
  });

  it("does not leave context behind on pooled connections", async () => {
    const w = await world();
    await w.asA.select().from(animals);
    for (let i = 0; i < 5; i++) {
      const leaked = await appPool.query(
        "SELECT current_setting('app.household_id', true) AS h, current_setting('app.user_id', true) AS u",
      );
      expect([null, ""]).toContain(leaked.rows[0].h);
      expect([null, ""]).toContain(leaked.rows[0].u);
    }
  });

  it("scopes every statement of a transaction and discards the context afterwards", async () => {
    const w = await world();
    const seen = await w.asA.transaction(async (tx) => {
      const first = await tx.select({ id: animals.id }).from(animals);
      const second = await tx.select({ id: animals.id }).from(animals);
      return [first.length, second.length];
    });
    expect(seen).toEqual([1, 1]);
    const after = await appPool.query("SELECT id FROM animals");
    expect(after.rowCount).toBe(0);
  });
});

describe("row-level security: households, memberships and invites", () => {
  it("shows a user only the households and memberships they belong to", async () => {
    const w = await world();
    const asUser = scopeDb(db, { userId: w.ownerA.id });
    expect((await asUser.select().from(households)).map((row) => row.id)).toEqual([
      w.householdA.id,
    ]);
    expect((await asUser.select().from(householdMembers)).map((row) => row.householdId)).toEqual([
      w.householdA.id,
    ]);
  });

  it("does not let a member promote themselves in another household", async () => {
    const w = await world();
    const asAinB = scopeDb(db, { userId: w.ownerA.id, householdId: w.householdB.id });
    await expect(
      asAinB.insert(householdMembers).values({
        householdId: w.householdB.id,
        userId: w.ownerA.id,
        role: "owner",
      }),
    ).rejects.toThrow();
    const members = await db.select().from(householdMembers);
    expect(members.filter((member) => member.householdId === w.householdB.id)).toHaveLength(1);
  });

  it("lets the bearer of an invite token see exactly that invite and nothing else", async () => {
    const w = await world();
    const expiresAt = new Date(Date.now() + 86_400_000);
    await db.insert(householdInvites).values([
      {
        householdId: w.householdB.id,
        email: "a@example.test",
        role: "viewer",
        tokenHash: "hash-one",
        invitedBy: w.ownerB.id,
        expiresAt,
      },
      {
        householdId: w.householdB.id,
        email: "b@example.test",
        role: "viewer",
        tokenHash: "hash-two",
        invitedBy: w.ownerB.id,
        expiresAt,
      },
    ]);
    const guest = await createUser(db);
    const bearer = scopeDb(db, { userId: guest.id, inviteTokenHash: "hash-one" });
    const seen = await bearer.select().from(householdInvites);
    expect(seen.map((row) => row.tokenHash)).toEqual(["hash-one"]);

    const noToken = scopeDb(db, { userId: guest.id });
    expect(await noToken.select().from(householdInvites)).toHaveLength(0);
  });

  it("lets a token bearer join only the invited household, with the invited role", async () => {
    const w = await world();
    await db.insert(householdInvites).values({
      householdId: w.householdB.id,
      email: "c@example.test",
      role: "viewer",
      tokenHash: "hash-join",
      invitedBy: w.ownerB.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const guest = await createUser(db);
    const scoped = (householdId: string) =>
      scopeDb(db, { userId: guest.id, householdId, inviteTokenHash: "hash-join" });
    await expect(
      scoped(w.householdB.id).insert(householdMembers).values({
        householdId: w.householdB.id,
        userId: guest.id,
        role: "editor",
      }),
    ).rejects.toThrow();
    await expect(
      scoped(w.householdA.id).insert(householdMembers).values({
        householdId: w.householdA.id,
        userId: guest.id,
        role: "viewer",
      }),
    ).rejects.toThrow();
    await scoped(w.householdB.id)
      .insert(householdMembers)
      .values({ householdId: w.householdB.id, userId: guest.id, role: "viewer" });
  });
});

describe("row-level security: the worker role", () => {
  it("reads across households but not credentials or sessions", async () => {
    const w = await world();
    const all = await workerPool.query("SELECT id FROM animals WHERE id = ANY($1)", [
      [w.animalA, w.animalB],
    ]);
    expect(all.rowCount).toBe(2);
    await expect(workerPool.query("SELECT id FROM sessions")).rejects.toThrow(/permission denied/);
    await expect(workerPool.query("SELECT id FROM accounts")).rejects.toThrow(/permission denied/);
    expect(sessions).toBeDefined();
  });

  it("is not allowed to change the schema or roles", async () => {
    await expect(workerPool.query("CREATE TABLE should_not_exist (id int)")).rejects.toThrow();
    await expect(appPool.query("DROP TABLE animals")).rejects.toThrow();
  });
});
