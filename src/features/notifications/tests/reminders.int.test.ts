import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { reminders } from "@/db/schema";
import { seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { createRemindersRepository } from "../server/reminders.repository";
import { syncDateReminder } from "../server/sync";

const db = setupTestDatabase();
const at = (iso: string) => new Date(iso);

describe("reminders repository", () => {
  it("is idempotent: syncing the same date repeatedly keeps one row", async () => {
    const w = await seedTwoHouseholds(db);
    const repo = createRemindersRepository(db, {
      householdId: w.householdA.id,
      userId: w.ownerA.id,
    });
    const key = { sourceType: "follow_up", sourceId: randomUUID() } as const;
    const desired = { dueAt: at("2025-01-10T08:00:00Z"), animalId: null, title: "Vet" };
    await Promise.all([repo.sync(key, desired), repo.sync(key, desired), repo.sync(key, desired)]);
    await repo.sync(key, desired);
    expect(await repo.listForSource(key)).toHaveLength(1);
  });

  it("cancels the old row when the date changes and revives it when it changes back", async () => {
    const w = await seedTwoHouseholds(db);
    const repo = createRemindersRepository(db, {
      householdId: w.householdA.id,
      userId: w.ownerA.id,
    });
    const key = { sourceType: "follow_up", sourceId: randomUUID() } as const;
    const first = at("2025-01-10T08:00:00Z");
    const second = at("2025-01-20T08:00:00Z");
    await repo.sync(key, { dueAt: first, animalId: null, title: "Vet" });
    await repo.sync(key, { dueAt: second, animalId: null, title: "Vet" });
    let rows = await repo.listForSource(key);
    expect(rows.map((r) => [r.dueAt.toISOString(), r.cancelledAt !== null])).toEqual([
      [first.toISOString(), true],
      [second.toISOString(), false],
    ]);

    await repo.sync(key, { dueAt: first, animalId: null, title: "Vet" });
    rows = await repo.listForSource(key);
    expect(rows.map((r) => r.cancelledAt !== null)).toEqual([false, true]);
  });

  it("never reopens or cancels a reminder that was already done", async () => {
    const w = await seedTwoHouseholds(db);
    const repo = createRemindersRepository(db, {
      householdId: w.householdA.id,
      userId: w.ownerA.id,
    });
    const key = { sourceType: "follow_up", sourceId: randomUUID() } as const;
    const due = at("2025-01-10T08:00:00Z");
    await repo.sync(key, { dueAt: due, animalId: null, title: "Vet" });
    await db
      .update(reminders)
      .set({ doneAt: new Date() })
      .where(eq(reminders.sourceId, key.sourceId));
    await repo.sync(key, { dueAt: due, animalId: null, title: "Renamed" });
    await repo.cancel(key);
    const [row] = await repo.listForSource(key);
    expect(row?.doneAt).not.toBeNull();
    expect(row?.cancelledAt).toBeNull();
    expect(row?.title).toBe("Vet");
  });

  it("tenant isolation: another household cannot read or cancel a reminder", async () => {
    const w = await seedTwoHouseholds(db);
    const key = { sourceType: "vaccination_due", sourceId: randomUUID() } as const;
    await createRemindersRepository(db, { householdId: w.householdA.id, userId: w.ownerA.id }).sync(
      key,
      {
        dueAt: at("2025-01-10T08:00:00Z"),
        animalId: null,
        title: "Rabies",
      },
    );
    const other = createRemindersRepository(db, {
      householdId: w.householdB.id,
      userId: w.ownerB.id,
    });
    expect(await other.listForSource(key)).toEqual([]);
    await other.cancel(key);
    const rows = await createRemindersRepository(db, {
      householdId: w.householdA.id,
      userId: w.ownerA.id,
    }).listForSource(key);
    expect(rows.map((r) => r.cancelledAt)).toEqual([null]);
  });
});

describe("syncDateReminder", () => {
  it("computes the due time in the household zone, handles leap days and clears on null", async () => {
    const w = await seedTwoHouseholds(db);
    const household = { householdId: w.householdA.id, timezone: "America/New_York" };
    const key = { sourceType: "follow_up", sourceId: randomUUID() } as const;
    const repo = createRemindersRepository(db, {
      householdId: w.householdA.id,
      userId: w.ownerA.id,
    });

    await syncDateReminder(db, household, key, {
      date: "2024-02-29",
      animalId: null,
      title: "Vet",
    });
    expect((await repo.listForSource(key))[0]?.dueAt.toISOString()).toBe(
      "2024-02-29T14:00:00.000Z",
    );

    await syncDateReminder(db, household, key, { date: null, animalId: null, title: "Vet" });
    expect((await repo.listForSource(key)).every((r) => r.cancelledAt)).toBe(true);
  });
});
