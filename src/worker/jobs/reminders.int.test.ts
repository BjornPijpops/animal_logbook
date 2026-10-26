import { describe, expect, it } from "vitest";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { createMedication } from "@/features/medications";
import { createEmailChannel } from "@/features/notifications/worker";
import { seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { runRemindersOnce, type ReminderJobDeps } from "./reminders";

const db = setupTestDatabase();

describe("reminder jobs", () => {
  it("sends a due dose reminder exactly once even when the pass runs twice", async () => {
    const w = await seedTwoHouseholds(db);
    const ctx = ctxFor(w.ownerA, w.householdA, "owner", "UTC");
    const animalId = await seedAnimal(db, ctx, "Milo");
    const created = await createMedication(
      { db, now: () => new Date("2025-06-10T12:00:00Z") },
      ctx,
      {
        animalId,
        name: "Antibiotic",
        dosage: "1 tablet",
        startedOn: "2025-06-01",
        endedOn: "",
        notes: "",
        kind: "daily",
        times: ["20:00"],
        weekdays: [],
        intervalDays: null,
      },
    );
    expect(created.ok).toBe(true);

    const sent: { to: string; text: string }[] = [];
    const now = new Date("2025-06-10T20:01:00Z");
    const deps: ReminderJobDeps = {
      db,
      staleWindowHours: 24,
      missedAfterHours: 4,
      delivery: {
        db,
        appUrl: "http://app.test",
        staleWindowHours: 24,
        now: () => now,
        channels: {
          email: createEmailChannel({
            async send(message) {
              sent.push(message);
            },
          }),
        },
      },
    };
    await runRemindersOnce(deps, now);
    await runRemindersOnce(deps, now);

    const mine = sent.filter((message) => message.to === w.ownerA.email);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.text).not.toContain("Antibiotic");
    expect(sent.some((message) => message.to === w.ownerB.email)).toBe(false);
  });
});
