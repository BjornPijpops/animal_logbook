import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { animals } from "@/db/schema";
import { createAnimalsRepository } from "../server/animals.repository";
import { seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import {
  addPhoto,
  addWeight,
  createAnimal,
  deleteAnimal,
  deletePhoto,
  deleteWeight,
  getAnimalFormHints,
  getAnimalOverview,
  listAnimals,
  setPrimaryPhoto,
  updateAnimal,
} from "../server/service";
import { MAX_PHOTOS_PER_ANIMAL } from "../schemas";
import { animalInput, ctxFor, jpegWithGps, makeAnimalDeps } from "./helpers";

const db = setupTestDatabase();

async function setup() {
  const w = await seedTwoHouseholds(db);
  const { deps, storage } = makeAnimalDeps(db, () => new Date("2024-06-15T10:00:00Z"));
  const ctx = ctxFor(w.ownerA, w.householdA, "owner");
  return { w, deps, storage, ctx };
}

async function newAnimal(overrides = {}) {
  const s = await setup();
  const created = await createAnimal(s.deps, s.ctx, animalInput(overrides));
  if (!created.ok) throw new Error("setup failed");
  return { ...s, animal: created.value };
}

describe("animal profile", () => {
  it("stores every profile field and maps empty strings to null", async () => {
    const { animal } = await newAnimal({
      registrationNumber: "",
      colorMarkings: "",
      sterilized: "unknown",
      birthDate: "",
      birthDateIsEstimate: true,
    });
    expect(animal.species).toBe("dog");
    expect(animal.registrationNumber).toBeNull();
    expect(animal.colorMarkings).toBeNull();
    expect(animal.sterilized).toBeNull();
    expect(animal.birthDate).toBeNull();
    expect(animal.birthDateIsEstimate).toBe(false);
    expect(animal.chipNumber).toBe("981000000000001");
  });

  it("keeps a leap-day birth date as a plain date", async () => {
    const { animal } = await newAnimal({ birthDate: "2020-02-29" });
    expect(animal.birthDate).toBe("2020-02-29");
  });

  it("accepts any species through 'other' and requires a name for it", async () => {
    const s = await setup();
    const ok = await createAnimal(
      s.deps,
      s.ctx,
      animalInput({ species: "other", speciesOther: "Axolotl", breed: "Leucistic" }),
    );
    expect(ok.ok && ok.value.speciesOther).toBe("Axolotl");
    const missing = await createAnimal(
      s.deps,
      s.ctx,
      animalInput({ species: "other", speciesOther: " " }),
    );
    expect(missing.ok).toBe(false);
    const dropped = await createAnimal(
      s.deps,
      s.ctx,
      animalInput({ species: "cat", speciesOther: "ignored" }),
    );
    expect(dropped.ok && dropped.value.speciesOther).toBeNull();

    const hints = await getAnimalFormHints(s.deps, s.ctx);
    expect(hints.ok && hints.value.speciesOther).toEqual(["Axolotl"]);
    expect(hints.ok && hints.value.breeds).toContain("Leucistic");
  });

  it("rejects invalid input", async () => {
    const s = await setup();
    for (const bad of [
      animalInput({ name: "  " }),
      animalInput({ birthDate: "2021-02-30" }),
      animalInput({ name: "x".repeat(81) }),
    ]) {
      const result = await createAnimal(s.deps, s.ctx, bad);
      expect(result.ok).toBe(false);
    }
    expect((await createAnimal(s.deps, s.ctx, { name: "x" })).ok).toBe(false);
    expect((await createAnimal(s.deps, s.ctx, { ...animalInput(), species: "dragon" })).ok).toBe(
      false,
    );
  });

  it("updates and soft-deletes; deleted animals disappear but the row remains", async () => {
    const { deps, ctx, animal } = await newAnimal();
    const updated = await updateAnimal(deps, ctx, animal.id, animalInput({ name: "Renamed" }));
    expect(updated.ok && updated.value.name).toBe("Renamed");

    expect((await deleteAnimal(deps, ctx, animal.id)).ok).toBe(true);
    expect((await getAnimalOverview(deps, ctx, animal.id)).ok).toBe(false);
    expect((await updateAnimal(deps, ctx, animal.id, animalInput())).ok).toBe(false);
    expect((await deleteAnimal(deps, ctx, animal.id)).ok).toBe(false);
    const list = await listAnimals(deps, ctx);
    expect(list.ok && list.value.find((a) => a.id === animal.id)).toBeUndefined();
    const [row] = await db.select().from(animals).where(eq(animals.id, animal.id));
    expect(row?.deletedAt).not.toBeNull();
    expect(await createAnimalsRepository(db, ctx.householdId).find(animal.id)).toBeNull();
  });

  it("refuses to add photos or weights to a deleted animal", async () => {
    const { deps, ctx, animal } = await newAnimal();
    await deleteAnimal(deps, ctx, animal.id);
    expect((await addPhoto(deps, ctx, animal.id, await jpegWithGps())).ok).toBe(false);
    const weight = await addWeight(deps, ctx, animal.id, {
      weight: 1,
      unit: "kg",
      measuredOn: "2024-01-01",
      note: "",
    });
    expect(weight.ok).toBe(false);
  });
});

describe("weights", () => {
  it("derives current weight from the latest measurement, not the latest insert", async () => {
    const { deps, ctx, animal } = await newAnimal();
    const add = (weight: number, measuredOn: string, unit: "kg" | "lb" = "kg") =>
      addWeight(deps, ctx, animal.id, { weight, unit, measuredOn, note: "" });
    expect((await add(10, "2024-03-01")).ok).toBe(true);
    const newest = await add(11.25, "2024-05-01");
    expect((await add(9, "2024-01-01")).ok).toBe(true);

    let overview = await getAnimalOverview(deps, ctx, animal.id);
    expect(overview.ok && overview.value.currentWeightGrams).toBe(11250);
    expect(overview.ok && overview.value.weights.map((w) => w.weightGrams)).toEqual([
      11250, 10000, 9000,
    ]);

    if (!newest.ok) throw new Error("setup");
    expect((await deleteWeight(deps, ctx, animal.id, newest.value.id)).ok).toBe(true);
    overview = await getAnimalOverview(deps, ctx, animal.id);
    expect(overview.ok && overview.value.currentWeightGrams).toBe(10000);
  });

  it("has no current weight before the first entry and converts pounds to grams", async () => {
    const { deps, ctx, animal } = await newAnimal();
    const before = await getAnimalOverview(deps, ctx, animal.id);
    expect(before.ok && before.value.currentWeightGrams).toBeNull();
    const lb = await addWeight(deps, ctx, animal.id, {
      weight: 10,
      unit: "lb",
      measuredOn: "2024-02-29",
      note: "leap day",
    });
    expect(lb.ok && lb.value.weightGrams).toBe(4536);
    expect(lb.ok && lb.value.measuredAt.toISOString()).toBe("2024-02-29T12:00:00.000Z");
  });

  it("rejects zero, negative, absurd and future weights", async () => {
    const { deps, ctx, animal } = await newAnimal();
    for (const input of [
      { weight: 0, unit: "kg", measuredOn: "2024-01-01", note: "" },
      { weight: -1, unit: "kg", measuredOn: "2024-01-01", note: "" },
      { weight: 5000, unit: "kg", measuredOn: "2024-01-01", note: "" },
      { weight: 5, unit: "kg", measuredOn: "2024-06-20", note: "" },
      { weight: 5, unit: "stone", measuredOn: "2024-01-01", note: "" },
      { weight: 0.0001, unit: "kg", measuredOn: "2024-01-01", note: "" },
    ]) {
      expect((await addWeight(deps, ctx, animal.id, input)).ok).toBe(false);
    }
  });
});

describe("photos", () => {
  it("makes the first photo primary and lets the user choose another", async () => {
    const { deps, ctx, animal } = await newAnimal();
    await addPhoto(deps, ctx, animal.id, await jpegWithGps());
    await addPhoto(deps, ctx, animal.id, await jpegWithGps());
    let overview = await getAnimalOverview(deps, ctx, animal.id);
    if (!overview.ok) throw new Error("overview");
    expect(overview.value.photos.map((p) => p.isPrimary)).toEqual([true, false]);
    const second = overview.value.photos[1];
    if (!second) throw new Error("second photo");

    expect((await setPrimaryPhoto(deps, ctx, animal.id, second.id)).ok).toBe(true);
    overview = await getAnimalOverview(deps, ctx, animal.id);
    expect(
      overview.ok && overview.value.photos.filter((p) => p.isPrimary).map((p) => p.id),
    ).toEqual([second.id]);

    const list = await listAnimals(deps, ctx);
    expect(list.ok && list.value[0]?.thumbFileId).toBe(second.thumbFileId);
  });

  it("deleting the primary photo promotes another and removes the stored bytes", async () => {
    const { deps, ctx, animal, storage } = await newAnimal();
    await addPhoto(deps, ctx, animal.id, await jpegWithGps());
    await addPhoto(deps, ctx, animal.id, await jpegWithGps());
    expect(storage.keys()).toHaveLength(4);
    const overview = await getAnimalOverview(deps, ctx, animal.id);
    if (!overview.ok) throw new Error("overview");
    const [first, second] = overview.value.photos;
    if (!first || !second) throw new Error("photos");

    expect((await deletePhoto(deps, ctx, animal.id, first.id)).ok).toBe(true);
    expect(storage.keys()).toHaveLength(2);
    const after = await getAnimalOverview(deps, ctx, animal.id);
    expect(after.ok && after.value.photos.map((p) => [p.id, p.isPrimary])).toEqual([
      [second.id, true],
    ]);
    expect((await deletePhoto(deps, ctx, animal.id, first.id)).ok).toBe(false);
  });

  it("rejects spoofed, empty and oversized uploads without storing anything", async () => {
    const { deps, ctx, animal, storage } = await newAnimal();
    const results = [
      await addPhoto(deps, ctx, animal.id, Buffer.from("<script>alert(1)</script>")),
      await addPhoto(deps, ctx, animal.id, Buffer.alloc(0)),
      await addPhoto({ ...deps, maxUploadBytes: 100 }, ctx, animal.id, await jpegWithGps()),
    ];
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("validation");
    }
    expect(storage.keys()).toEqual([]);
  });

  it("enforces the per-animal photo limit and cleans up the rejected upload", async () => {
    const { deps, ctx, animal, storage } = await newAnimal();
    const image = await jpegWithGps();
    for (let i = 0; i < MAX_PHOTOS_PER_ANIMAL; i++) {
      expect((await addPhoto(deps, ctx, animal.id, image)).ok).toBe(true);
    }
    const extra = await addPhoto(deps, ctx, animal.id, image);
    expect(extra.ok).toBe(false);
    expect(storage.keys()).toHaveLength(MAX_PHOTOS_PER_ANIMAL * 2);
  });

  it("concurrent first uploads produce exactly one primary photo", async () => {
    const { deps, ctx, animal } = await newAnimal();
    const image = await jpegWithGps();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => addPhoto(deps, ctx, animal.id, image)),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const overview = await getAnimalOverview(deps, ctx, animal.id);
    expect(overview.ok && overview.value.photos.filter((p) => p.isPrimary)).toHaveLength(1);
    expect(overview.ok && overview.value.photos).toHaveLength(4);
  });
});
