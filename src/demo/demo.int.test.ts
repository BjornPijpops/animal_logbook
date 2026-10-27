import { eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { scopeDb } from "@/db/scope";
import {
  animals,
  appointments,
  auditLog,
  documents,
  expenses,
  files,
  foodPlans,
  medicalRecords,
  medicationDoses,
  medications,
  reminders,
  users,
} from "@/db/schema";
import { getEmergencyCard, listAnimals } from "@/features/animals/server/service";
import { listAuditLog } from "@/features/audit/server/service";
import { getDashboard } from "@/features/dashboard/server/service";
import { createExpense, getExpenseSummary } from "@/features/expenses/server/service";
import { investigate } from "@/features/food/server/service";
import { resolveCtx } from "@/features/households/server/context";
import {
  createEmailChannel,
  createPushChannel,
  runDelivery,
} from "@/features/notifications/worker";
import {
  createFakeMailer,
  createMemoryStorage,
  seedTwoHouseholds,
  setupTestDatabase,
} from "@/test/db";
import { DEMO_IDS, DEMO_OWNER, DEMO_VIEWER } from "./constants";
import { assertDemoSeedAllowed } from "./cli";
import { isDemoRecipient } from "@/lib/notify/demo-guard";
import { createDemoDates } from "./dates";
import { removeDemo, seedDemo } from "./seed";

const db = setupTestDatabase();
const storage = createMemoryStorage();
const NOW = new Date();
const d = createDemoDates(NOW, "Europe/Brussels");
const deps = { db, storage, now: NOW };

const inHousehold = () => scopeDb(db, { userId: DEMO_IDS.owner, householdId: DEMO_IDS.household });

async function counts() {
  const tables = {
    animals,
    appointments,
    medicalRecords,
    medications,
    medicationDoses,
    expenses,
    documents,
    foodPlans,
    files,
    reminders,
    auditLog,
  };
  const result: Record<string, number> = {};
  for (const [name, table] of Object.entries(tables)) {
    const [row] = await inHousehold()
      .select({ n: sql<number>`count(*)::int` })
      .from(table);
    result[name] = row?.n ?? 0;
  }
  return result;
}

async function ctxFor(userId: string, name: string) {
  const result = await resolveCtx(db, { id: userId, name }, DEMO_IDS.household);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

let lunaId = "";
let owner: Awaited<ReturnType<typeof ctxFor>>;
let viewer: Awaited<ReturnType<typeof ctxFor>>;

describe("demo seed", () => {
  beforeAll(async () => {
    await removeDemo({ db, storage });
    const result = await seedDemo(deps);
    expect(result.created).toBe(true);
    lunaId = result.lunaId ?? "";
    owner = await ctxFor(DEMO_OWNER.id, DEMO_OWNER.name);
    viewer = await ctxFor(DEMO_VIEWER.id, DEMO_VIEWER.name);
  }, 120_000);

  afterAll(async () => {
    await removeDemo({ db, storage });
  });

  it("creates two animals, both demo accounts and the expected household", async () => {
    const list = await listAnimals({ db, storage, maxUploadBytes: 1 }, owner);
    expect(list.ok && list.value.map((a) => a.name).sort()).toEqual(["Luna", "Milo"]);
    expect(owner.timezone).toBe("Europe/Brussels");
    expect(owner.role).toBe("owner");
    expect(viewer.role).toBe("viewer");
    const [account] = await db.select().from(users).where(eq(users.id, DEMO_OWNER.id));
    expect(account?.emailVerified).toBe(true);
    expect(account?.phone).toBeTruthy();
  });

  it("is idempotent: a second run changes nothing and --reset recreates the same shape", async () => {
    const before = await counts();
    expect(before.animals).toBe(2);
    expect(before.appointments).toBe(10);
    expect(before.documents).toBe(5);
    expect(before.foodPlans).toBe(4);

    const again = await seedDemo(deps);
    expect(again.created).toBe(false);
    expect(await counts()).toEqual(before);

    const reset = await seedDemo(deps, { reset: true });
    expect(reset.created).toBe(true);
    lunaId = reset.lunaId ?? "";
    expect(await counts()).toEqual(before);
    const stored = await inHousehold().select({ key: files.storageKey }).from(files);
    expect(storage.keys().sort()).toEqual(stored.map((f) => f.key).sort());
  }, 120_000);

  it("only ever touches the demo household", async () => {
    const world = await seedTwoHouseholds(db);
    lunaId = (await seedDemo(deps, { reset: true })).lunaId ?? "";
    const other = await resolveCtx(db, { id: world.ownerA.id, name: "A" }, world.householdA.id);
    expect(other.ok).toBe(true);
    const ownerB = await resolveCtx(db, { id: world.ownerB.id, name: "B" }, world.householdB.id);
    if (!other.ok || !ownerB.ok) throw new Error("context");
    expect((await resolveCtx(db, { id: world.ownerA.id, name: "A" }, DEMO_IDS.household)).ok).toBe(
      false,
    );

    const dashboard = await getDashboard({ db, now: () => NOW }, ownerB.value);
    expect(dashboard.ok).toBe(true);
    if (dashboard.ok) {
      expect(dashboard.value.appointments.items).toEqual([]);
      expect(dashboard.value.overdueVaccinations.items).toEqual([]);
      expect(dashboard.value.documents.items).toEqual([]);
      expect(dashboard.value.medications.dueToday).toEqual([]);
    }
    const peek = await getEmergencyCard({ db, storage, maxUploadBytes: 1 }, ownerB.value, lunaId);
    expect(peek.ok).toBe(false);
    const list = await listAnimals({ db, storage, maxUploadBytes: 1 }, ownerB.value);
    expect(list.ok && list.value).toEqual([]);
    const lunaFromA = await getEmergencyCard(
      { db, storage, maxUploadBytes: 1 },
      other.value,
      lunaId,
    );
    expect(lunaFromA.ok).toBe(false);
  }, 120_000);

  it("totals equal the sum of their parts with nothing counted twice", async () => {
    owner = await ctxFor(DEMO_OWNER.id, DEMO_OWNER.name);
    const summary = await getExpenseSummary({ db }, owner, {
      year: null,
      animalId: null,
      category: null,
    });
    if (!summary.ok) throw new Error("summary");
    const rows = await inHousehold()
      .select({
        amount: expenses.amountMinor,
        appointmentId: expenses.appointmentId,
        foodPlanId: expenses.foodPlanId,
        category: expenses.category,
        deletedAt: expenses.deletedAt,
      })
      .from(expenses)
      .where(isNull(expenses.deletedAt));
    const sum = rows.reduce((total, row) => total + row.amount, 0);
    const yearly = summary.value.yearly.reduce((total, row) => total + row.totalMinor, 0);
    const monthly = summary.value.monthly.reduce((total, row) => total + row.totalMinor, 0);
    const categories = summary.value.categories.reduce((total, row) => total + row.totalMinor, 0);
    expect(summary.value.yearly.every((row) => row.currency === "EUR")).toBe(true);
    expect(new Set(summary.value.categories.map((row) => row.category))).toEqual(
      new Set(["vet", "food", "insurance", "grooming", "toys", "medication", "training", "other"]),
    );
    expect(yearly).toBe(sum);
    expect(categories).toBe(sum);
    expect(monthly).toBeLessThanOrEqual(sum);
    // Eight costed appointments are alive; the soft-deleted one contributes nothing.
    expect(rows.filter((row) => row.appointmentId !== null)).toHaveLength(8);
    expect(rows.filter((row) => row.foodPlanId !== null)).toHaveLength(1);
    const deletedAppointment = await inHousehold()
      .select({ id: appointments.id })
      .from(appointments)
      .where(sql`${appointments.deletedAt} is not null`);
    expect(deletedAppointment).toHaveLength(1);
  });

  it("shows derived allergies on the emergency card", async () => {
    const card = await getEmergencyCard({ db, storage, maxUploadBytes: 1 }, owner, lunaId);
    if (!card.ok) throw new Error("card");
    expect(card.value.allergies.map((a) => a.title).sort()).toEqual(["Chicken", "Pollen"]);
    expect(card.value.photoFileId).not.toBeNull();
    expect(card.value.owners[0]?.phone).toBeTruthy();
  });

  it("puts the overdue vaccination, follow-up, due dose and expiring document on the dashboard", async () => {
    const result = await getDashboard({ db, now: () => NOW }, owner);
    if (!result.ok) throw new Error("dashboard");
    const board = result.value;
    expect(board.overdueVaccinations.items.map((v) => [v.title, v.nextDueOn])).toEqual([
      ["Rabies booster", d.days(-5)],
    ]);
    expect(board.followUps.items.map((f) => f.followUpDate)).toContain(d.days(9));
    expect(board.appointments.items.some((a) => a.title.startsWith("Follow-up"))).toBe(true);
    expect(board.medications.dueToday.length).toBeGreaterThan(0);
    expect(board.medications.missed.length).toBeGreaterThan(0);
    expect(board.medications.ending.map((m) => m.endedOn)).toContain(d.days(5));
    expect(board.documents.items.map((x) => [x.type, x.expiresOn])).toContainEqual([
      "passport",
      d.days(40),
    ]);
    expect(board.spending.totals[0]?.currency).toBe("EUR");
    expect(board.dietChanges.items.length).toBeGreaterThan(0);
  });

  it("includes the ongoing skin irritation in the investigation view", async () => {
    const result = await investigate({ db }, owner, {
      animalId: lunaId,
      from: d.days(-100),
      to: d.today,
    });
    if (!result.ok) throw new Error("investigate");
    const records = result.value.filter((entry) => entry.source === "record");
    expect(records.map((r) => r.title)).toEqual(
      expect.arrayContaining(["Skin irritation", "Chicken"]),
    );
    const food = result.value.filter((entry) => entry.source === "food");
    expect(food.length).toBeGreaterThanOrEqual(3);
    const irritation = records.find((r) => r.title === "Skin irritation");
    expect(irritation?.endedOn).toBeNull();
    const secondChange = food.filter((entry) => entry.kind === "started").map((e) => e.date);
    expect(irritation && secondChange.some((date) => irritation.date < date)).toBe(true);
  });

  it("lets the viewer read but not write", async () => {
    const board = await getDashboard({ db, now: () => NOW }, viewer);
    expect(board.ok).toBe(true);
    const summary = await getExpenseSummary({ db }, viewer, {
      year: null,
      animalId: null,
      category: null,
    });
    expect(summary.ok).toBe(true);
    const write = await createExpense({ db }, viewer, {
      category: "toys",
      date: d.today,
      amount: "1.00",
      currency: "EUR",
      description: "Should be refused",
      notes: "",
      animalId: "",
      medicationId: "",
    });
    expect(write.ok).toBe(false);
    const audit = await listAuditLog({ db }, viewer);
    expect(audit.ok).toBe(false);
  });

  it("records the invite and role change in the audit log", async () => {
    const audit = await listAuditLog({ db }, owner);
    if (!audit.ok) throw new Error("audit");
    const events = audit.value.entries.map((entry) => entry.event);
    expect(events).toEqual(
      expect.arrayContaining(["invite_sent", "invite_accepted", "role_changed"]),
    );
  });

  it("creates reminders but can never deliver anything to demo recipients", async () => {
    const [{ open } = { open: 0 }] = await inHousehold()
      .select({ open: sql<number>`count(*)::int` })
      .from(reminders)
      .where(isNull(reminders.doneAt));
    expect(open).toBeGreaterThan(0);

    const mailer = createFakeMailer();
    const pushSend = vi.fn(async (_sub: { endpoint: string }, _payload: string) => ({
      status: 201,
    }));
    const sendSpy = vi.spyOn(mailer, "send");
    const evening = d.at(d.today, "23:59");
    const report = await runDelivery({
      db,
      appUrl: "http://localhost:3000",
      staleWindowHours: 24,
      now: () => evening,
      channels: {
        email: createEmailChannel(mailer),
        push: createPushChannel(
          {
            list: async (userId) => [
              {
                id: userId,
                endpoint: `https://push.example.test/${userId}`,
                p256dh: "k",
                auth: "a",
              },
            ],
            remove: async () => undefined,
          },
          { send: pushSend },
        ),
      },
    });
    expect(report.enqueued).toBeGreaterThan(0);
    // runDelivery works on every household in the shared test database, so other suites' reminders
    // may legitimately be delivered; only the demo recipients must never be reached.
    const demoUsers = [DEMO_IDS.owner, DEMO_IDS.viewer];
    for (const [message] of sendSpy.mock.calls) expect(isDemoRecipient(message.to)).toBe(false);
    for (const [sub] of pushSend.mock.calls) {
      for (const id of demoUsers) expect(sub.endpoint).not.toContain(id);
    }
  }, 60_000);

  it("refuses to run in production unless explicitly allowed", () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: "production" })).toThrow(/Refusing/);
    expect(() =>
      assertDemoSeedAllowed({ NODE_ENV: "production", ALLOW_DEMO_SEED: "true" }),
    ).not.toThrow();
    expect(() => assertDemoSeedAllowed({ NODE_ENV: "development" })).not.toThrow();
  });
});
