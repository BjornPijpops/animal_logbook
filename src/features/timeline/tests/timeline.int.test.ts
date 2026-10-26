import { describe, expect, it } from "vitest";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { createAppointment, deleteAppointment } from "@/features/appointments";
import { appointmentInput } from "@/features/appointments/tests/helpers";
import { createMedicalRecord } from "@/features/medical";
import { recordInput } from "@/features/medical/tests/helpers";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { listTimeline } from "../server/service";

const db = setupTestDatabase();
const deps = { db };

async function world(timezone = "Europe/Amsterdam") {
  const w = await seedTwoHouseholds(db);
  const ctxA = ctxFor(w.ownerA, w.householdA, "owner", timezone);
  const ctxB = ctxFor(w.ownerB, w.householdB, "owner");
  const rex = await seedAnimal(db, ctxA, "Rex");
  const tom = await seedAnimal(db, ctxA, "Tom");
  return { ...w, ctxA, ctxB, rex, tom };
}

async function must<T>(promise: Promise<{ ok: true; value: T } | { ok: false }>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error("setup failed");
  return result.value;
}

async function list(ctx: Parameters<typeof listTimeline>[1], query: unknown = {}) {
  const result = await listTimeline(deps, ctx, query);
  if (!result.ok) throw new Error(`list failed: ${result.error.message}`);
  return result.value;
}

describe("timeline", () => {
  it("mixes appointments and records, newest first, with animal names", async () => {
    const w = await world();
    await must(
      createAppointment(
        deps,
        w.ctxA,
        appointmentInput(w.rex, { date: "2025-03-14", title: "Visit", followUpDate: "" }),
      ),
    );
    await must(
      createMedicalRecord(
        deps,
        w.ctxA,
        recordInput(w.rex, { startedOn: "2025-05-01", title: "Rabies", nextDueOn: "" }),
      ),
    );
    await must(
      createMedicalRecord(
        deps,
        w.ctxA,
        recordInput(w.tom, {
          type: "surgery",
          startedOn: "2025-01-10",
          title: "Neuter",
          nextDueOn: "",
        }),
      ),
    );
    const page = await list(w.ctxA);
    expect(page.items.map((i) => [i.kind, i.title, i.animalName])).toEqual([
      ["record", "Rabies", "Rex"],
      ["appointment", "Visit", "Rex"],
      ["record", "Neuter", "Tom"],
    ]);
    expect(page.total).toBe(3);
  });

  it("filters by animal, group, exact type and date range", async () => {
    const w = await world();
    await must(
      createAppointment(
        deps,
        w.ctxA,
        appointmentInput(w.rex, {
          type: "grooming",
          title: "Groom",
          date: "2025-03-10",
          followUpDate: "",
        }),
      ),
    );
    await must(
      createAppointment(
        deps,
        w.ctxA,
        appointmentInput(w.tom, {
          type: "vet",
          title: "Vet",
          date: "2025-03-20",
          followUpDate: "",
        }),
      ),
    );
    await must(
      createMedicalRecord(
        deps,
        w.ctxA,
        recordInput(w.rex, {
          type: "allergy",
          title: "Chicken",
          startedOn: "2025-03-15",
          nextDueOn: "",
        }),
      ),
    );
    const titles = async (q: object) => (await list(w.ctxA, q)).items.map((i) => i.title);

    expect(await titles({ animal: w.tom })).toEqual(["Vet"]);
    expect(await titles({ type: "record" })).toEqual(["Chicken"]);
    expect(await titles({ type: "appointment" })).toEqual(["Vet", "Groom"]);
    expect(await titles({ type: "appointment:grooming" })).toEqual(["Groom"]);
    expect(await titles({ type: "record:allergy" })).toEqual(["Chicken"]);
    expect(await titles({ from: "2025-03-12", to: "2025-03-18" })).toEqual(["Chicken"]);
    expect(await titles({ from: "2025-03-20" })).toEqual(["Vet"]);
  });

  it("uses the household-local day for late-evening appointments", async () => {
    const w = await world("America/New_York");
    await must(
      createAppointment(
        deps,
        w.ctxA,
        appointmentInput(w.rex, {
          date: "2025-03-14",
          time: "23:30",
          title: "Late",
          followUpDate: "",
        }),
      ),
    );
    const hit = await list(w.ctxA, { from: "2025-03-14", to: "2025-03-14" });
    expect(hit.items.map((i) => [i.title, i.localDate])).toEqual([["Late", "2025-03-14"]]);
    expect((await list(w.ctxA, { from: "2025-03-15" })).items).toEqual([]);
  });

  it("paginates and reports totals", async () => {
    const w = await world();
    for (let i = 1; i <= 23; i++) {
      const day = String(i).padStart(2, "0");
      await must(
        createAppointment(
          deps,
          w.ctxA,
          appointmentInput(w.rex, {
            title: `A${day}`,
            date: `2025-02-${day}`,
            followUpDate: "",
            cost: "",
          }),
        ),
      );
    }
    const first = await list(w.ctxA);
    const second = await list(w.ctxA, { page: 2 });
    expect([first.items.length, second.items.length, first.total, first.pageCount]).toEqual([
      20, 3, 23, 2,
    ]);
    expect(first.items[0]?.title).toBe("A23");
    expect(second.items.at(-1)?.title).toBe("A01");
  });

  it("shows deleted items only when asked", async () => {
    const w = await world();
    const id = (
      await must(createAppointment(deps, w.ctxA, appointmentInput(w.rex, { title: "Gone" })))
    ).id;
    await deleteAppointment(deps, w.ctxA, id);
    expect((await list(w.ctxA)).items).toEqual([]);
    const deleted = await list(w.ctxA, { deleted: true });
    expect(deleted.items.map((i) => i.title)).toEqual(["Gone"]);
    expect(deleted.items[0]?.deletedAt).toBeInstanceOf(Date);
  });

  it("rejects malformed filters", async () => {
    const w = await world();
    for (const bad of [
      { type: "nope" },
      { animal: "x" },
      { from: "2025-02-30" },
      { from: "2025-05-01", to: "2025-01-01" },
      { page: 0 },
    ]) {
      const result = await listTimeline(deps, w.ctxA, bad);
      expect(!result.ok && result.error.code).toBe("validation");
    }
  });
});

describe("tenant isolation and roles: timeline", () => {
  it("never lists another household's items, even when filtering by their animal", async () => {
    const w = await world();
    const animalB = await seedAnimal(db, w.ctxB, "Secret");
    await must(createAppointment(deps, w.ctxB, appointmentInput(animalB, { title: "B only" })));
    await must(createMedicalRecord(deps, w.ctxB, recordInput(animalB, { title: "B record" })));
    await must(createAppointment(deps, w.ctxA, appointmentInput(w.rex, { title: "A only" })));
    const everything = await list(w.ctxA);
    expect(everything.items.map((i) => i.title)).toEqual(["A only"]);
    expect((await list(w.ctxA, { animal: animalB })).items).toEqual([]);
    expect((await list(w.ctxB)).items.map((i) => i.title).sort()).toEqual(["B only", "B record"]);
  });

  it("viewers can read the timeline", async () => {
    const w = await world();
    await must(createAppointment(deps, w.ctxA, appointmentInput(w.rex)));
    const viewer = await createUser(db);
    await addMember(db, w.householdA.id, viewer.id, "viewer");
    const page = await list(ctxFor(viewer, w.householdA, "viewer"));
    expect(page.items).toHaveLength(1);
  });
});
