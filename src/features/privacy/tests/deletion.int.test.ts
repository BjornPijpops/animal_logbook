import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  expenses,
  files,
  householdInvites,
  households,
  pushSubscriptions,
  sessions,
  users,
} from "@/db/schema";
import { createAuditRepository } from "@/features/audit";
import { createUser, setPassword, setupTestDatabase, TEST_PASSWORD, addMember } from "@/test/db";
import { deleteAccount, deleteHousehold } from "../server/service";
import { addFile, addExpense, insertReadyExport, makeDeps, world } from "./fixtures";

const db = setupTestDatabase();

// Every column that references users, read from the catalog so a future table cannot be forgotten.
async function referencesTo(userId: string): Promise<string[]> {
  const columns = await db.execute<{ tbl: string; col: string }>(sql`
    SELECT conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE confrelid = 'users'::regclass AND contype = 'f'
  `);
  const left: string[] = [];
  for (const { tbl, col } of columns.rows) {
    const result = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM ${sql.raw(tbl)} WHERE ${sql.raw(`"${col}"`)} = ${userId}`,
    );
    if ((result.rows[0]?.n ?? 0) > 0) left.push(`${tbl}.${col}`);
  }
  return left;
}

describe("deleteAccount", () => {
  it("requires the right password and deletes nothing otherwise", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const result = await deleteAccount(parts.deps, w.ownerA, "wrong");
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(await db.select().from(users).where(eq(users.id, w.ownerA.id))).toHaveLength(1);
    const events = (await createAuditRepository(db, w.ctx.owner).list(10)).map((e) => e.event);
    expect(events).toContain("reauth_failed");
  });

  it("deletes a sole owner of a single-member household with everything they own", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const solo = await createUser(db, { email: `solo-${randomUUID()}@example.test` });
    await setPassword(db, solo.id);
    const [soloHousehold] = await db
      .insert(households)
      .values({ name: "Solo", createdBy: solo.id })
      .returning();
    if (!soloHousehold) throw new Error("setup");
    await addMember(db, soloHousehold.id, solo.id, "owner");
    const file = await addFile(db, parts.fileStorage, soloHousehold.id, "solo-bytes", solo.id);
    await addExpense(db, soloHousehold.id, "Solo expense");
    await db.insert(sessions).values({
      userId: solo.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await db.insert(sessions).values({
      userId: solo.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await db.insert(pushSubscriptions).values({
      userId: solo.id,
      endpoint: `https://push.example.test/${randomUUID()}`,
      p256dh: "p",
      auth: "a",
    });
    const exportKey = `${solo.id}/${randomUUID()}`;
    await parts.exportStorage.put(exportKey, Buffer.from("zip"));
    await insertReadyExport(db, {
      userId: solo.id,
      householdId: soloHousehold.id,
      storageKey: exportKey,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    // An invitation sent to this person by somebody else's household.
    await db.insert(householdInvites).values({
      householdId: w.householdA.id,
      email: solo.email,
      role: "viewer",
      tokenHash: randomUUID(),
      invitedBy: w.ownerA.id,
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const result = await deleteAccount(parts.deps, solo, TEST_PASSWORD);
    expect(result.ok && result.value.status).toBe("deleted");

    expect(await db.select().from(users).where(eq(users.id, solo.id))).toHaveLength(0);
    expect(
      await db.select().from(households).where(eq(households.id, soloHousehold.id)),
    ).toHaveLength(0);
    expect(await db.select().from(files).where(eq(files.id, file.id))).toHaveLength(0);
    expect(
      await db.select().from(expenses).where(eq(expenses.householdId, soloHousehold.id)),
    ).toHaveLength(0);
    expect(await parts.fileStorage.exists(file.storageKey)).toBe(false);
    expect(await parts.exportStorage.exists(exportKey)).toBe(false);
    expect(await db.select().from(sessions).where(eq(sessions.userId, solo.id))).toHaveLength(0);
    expect(
      await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, solo.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(householdInvites).where(eq(householdInvites.email, solo.email)),
    ).toHaveLength(0);
    expect(await referencesTo(solo.id)).toEqual([]);

    // Household A and B are untouched.
    expect(await parts.fileStorage.exists(w.fileA.storageKey)).toBe(true);
    expect(await parts.fileStorage.exists(w.fileB.storageKey)).toBe(true);
    expect(
      await db.select().from(households).where(eq(households.id, w.householdB.id)),
    ).toHaveLength(1);
  });

  it("blocks a sole owner whose household still has other members, and records the request", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const result = await deleteAccount(parts.deps, w.ownerA, TEST_PASSWORD);
    expect(result.ok && result.value).toEqual({ status: "blocked", households: ["Household A"] });
    expect(await db.select().from(users).where(eq(users.id, w.ownerA.id))).toHaveLength(1);
    expect(await parts.fileStorage.exists(w.fileA.storageKey)).toBe(true);
    const events = (await createAuditRepository(db, w.ctx.owner).list(10)).map((e) => e.event);
    expect(events).toContain("account_deletion_requested");
  });

  it("lets the owner proceed after transferring ownership", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const { transferOwnership } = await import("@/features/households/server/service");
    const transfer = await transferOwnership(
      {
        db,
        mailer: { send: async () => undefined },
        limiter: parts.deps.limiter,
        appUrl: "http://test",
      },
      w.ctx.owner,
      w.editor.id,
    );
    expect(transfer.ok).toBe(true);
    const result = await deleteAccount(parts.deps, w.ownerA, TEST_PASSWORD);
    expect(result.ok && result.value.status).toBe("deleted");
    expect(await referencesTo(w.ownerA.id)).toEqual([]);
    // The household lives on, with the new owner.
    expect(
      await db.select().from(households).where(eq(households.id, w.householdA.id)),
    ).toHaveLength(1);
  });

  it("lets a non-owner leave: membership goes, authored content stays without their name", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    await db.insert(expenses).values({
      householdId: w.householdA.id,
      category: "toys",
      incurredOn: "2030-02-02",
      amountMinor: 500,
      currency: "EUR",
      description: "Ball",
      createdBy: w.editor.id,
    });
    const result = await deleteAccount(parts.deps, w.editor, TEST_PASSWORD);
    expect(result.ok && result.value.status).toBe("deleted");
    expect(await referencesTo(w.editor.id)).toEqual([]);
    const [ball] = await db.select().from(expenses).where(eq(expenses.description, "Ball"));
    expect(ball?.createdBy).toBeNull();
    expect(await parts.fileStorage.exists(w.fileA.storageKey)).toBe(true);
    const entries = await createAuditRepository(db, w.ctx.owner).list(10);
    expect(entries.map((e) => e.event)).toContain("account_deleted");
  });

  it("lets a viewer delete their own account", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const result = await deleteAccount(parts.deps, w.viewer, TEST_PASSWORD);
    expect(result.ok && result.value.status).toBe("deleted");
    expect(await referencesTo(w.viewer.id)).toEqual([]);
  });
});

describe("deleteHousehold", () => {
  it("is owner-only and re-confirmed; deleting removes data and bytes of that household only", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    for (const ctx of [w.ctx.editor, w.ctx.viewer]) {
      const denied = await deleteHousehold(parts.deps, ctx, TEST_PASSWORD);
      expect(!denied.ok && denied.error.code).toBe("forbidden");
    }
    const wrong = await deleteHousehold(parts.deps, w.ctx.owner, "wrong");
    expect(!wrong.ok && wrong.error.code).toBe("forbidden");
    expect(
      await db.select().from(households).where(eq(households.id, w.householdA.id)),
    ).toHaveLength(1);

    const done = await deleteHousehold(parts.deps, w.ctx.owner, TEST_PASSWORD);
    expect(done.ok).toBe(true);
    expect(
      await db.select().from(households).where(eq(households.id, w.householdA.id)),
    ).toHaveLength(0);
    expect(await parts.fileStorage.exists(w.fileA.storageKey)).toBe(false);
    expect(await parts.fileStorage.exists(w.fileB.storageKey)).toBe(true);
    expect(
      await db.select().from(households).where(eq(households.id, w.householdB.id)),
    ).toHaveLength(1);
  });

  it("cannot target another household by forging the context", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const forged = { ...w.ctx.owner, householdId: w.householdB.id };
    await deleteHousehold(parts.deps, forged, TEST_PASSWORD);
    expect(
      await db.select().from(households).where(eq(households.id, w.householdB.id)),
    ).toHaveLength(1);
    expect(await parts.fileStorage.exists(w.fileB.storageKey)).toBe(true);
  });
});
