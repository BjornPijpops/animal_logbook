import { eq } from "drizzle-orm";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { animalPhotos, files } from "@/db/schema";
import { setupTestDatabase } from "@/test/db";
import { seedTwoHouseholds } from "@/test/db";
import { toAnimalValues } from "../server/service";
import { createAnimalsRepository } from "../server/animals.repository";
import {
  addPhoto,
  addWeight,
  createAnimal,
  deleteAnimal,
  deletePhoto,
  deleteWeight,
  getAnimalOverview,
  listAnimals,
  setPrimaryPhoto,
  updateAnimal,
} from "../server/service";
import { animalInput, ctxFor, jpegWithGps, makeAnimalDeps } from "./helpers";

const db = setupTestDatabase();

async function world() {
  const w = await seedTwoHouseholds(db);
  const { deps, storage } = makeAnimalDeps(db);
  const ctxA = ctxFor(w.ownerA, w.householdA, "owner");
  const ctxB = ctxFor(w.ownerB, w.householdB, "owner");
  const created = await createAnimal(deps, ctxA, animalInput());
  if (!created.ok) throw new Error("setup failed");
  const animal = created.value;
  const photo = await addPhoto(deps, ctxA, animal.id, await jpegWithGps());
  if (!photo.ok) throw new Error("photo setup failed");
  const weight = await addWeight(deps, ctxA, animal.id, {
    weight: 12.5,
    unit: "kg",
    measuredOn: "2024-01-10",
    note: "",
  });
  if (!weight.ok) throw new Error("weight setup failed");
  const overview = await getAnimalOverview(deps, ctxA, animal.id);
  if (!overview.ok) throw new Error("overview failed");
  return {
    ...w,
    deps,
    storage,
    ctxA,
    ctxB,
    animal,
    weight: weight.value,
    photo: overview.value.photos[0],
  };
}

describe("tenant isolation: animal repositories", () => {
  it("household B cannot read, update or delete household A's animals", async () => {
    const w = await world();
    const repoB = createAnimalsRepository(db, w.householdB.id);

    expect(await repoB.list()).toEqual([]);
    expect(await repoB.find(w.animal.id)).toBeNull();
    const values = toAnimalValues(animalInput());
    expect(await repoB.update(w.animal.id, { ...values, name: "Hijacked" })).toBeNull();
    expect(await repoB.softDelete(w.animal.id)).toBe(false);
    expect(await repoB.usedValues()).toEqual({ speciesOther: [], breeds: [] });

    const still = await createAnimalsRepository(db, w.householdA.id).find(w.animal.id);
    expect(still?.name).toBe(w.animal.name);
    expect(still?.deletedAt).toBeNull();
  });

  it("the database rejects child rows that point at another household's animal", async () => {
    const w = await world();
    await expect(
      db.insert((await import("@/db/schema")).weightEntries).values({
        householdId: w.householdB.id,
        animalId: w.animal.id,
        measuredAt: new Date(),
        weightGrams: 1000,
      }),
    ).rejects.toThrow();
  });
});

describe("tenant isolation: animal services", () => {
  it("household B gets not_found for every operation on household A's animal", async () => {
    const w = await world();
    const { deps, ctxB, animal, photo, weight } = w;
    if (!photo) throw new Error("no photo");
    const results = [
      await getAnimalOverview(deps, ctxB, animal.id),
      await updateAnimal(deps, ctxB, animal.id, animalInput()),
      await deleteAnimal(deps, ctxB, animal.id),
      await addPhoto(deps, ctxB, animal.id, await jpegWithGps()),
      await setPrimaryPhoto(deps, ctxB, animal.id, photo.id),
      await deletePhoto(deps, ctxB, animal.id, photo.id),
      await addWeight(deps, ctxB, animal.id, {
        weight: 5,
        unit: "kg",
        measuredOn: "2024-01-11",
        note: "",
      }),
      await deleteWeight(deps, ctxB, animal.id, weight.id),
    ];
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("not_found");
    }

    const listB = await listAnimals(deps, ctxB);
    expect(listB.ok && listB.value).toEqual([]);

    const overviewA = await getAnimalOverview(deps, w.ctxA, animal.id);
    expect(overviewA.ok && overviewA.value.photos).toHaveLength(1);
    expect(overviewA.ok && overviewA.value.weights).toHaveLength(1);
    expect(overviewA.ok && overviewA.value.animal.name).toBe(animal.name);
  });

  it("cannot attach A's photo or weight to B's own animal by id", async () => {
    const w = await world();
    const mine = await createAnimal(w.deps, w.ctxB, animalInput());
    if (!mine.ok) throw new Error("setup");
    const result = await setPrimaryPhoto(w.deps, w.ctxB, mine.value.id, w.photo?.id ?? "");
    expect(result.ok).toBe(false);
    const del = await deleteWeight(w.deps, w.ctxB, mine.value.id, w.weight.id);
    expect(del.ok).toBe(false);
    const rows = await db
      .select()
      .from(animalPhotos)
      .where(eq(animalPhotos.id, w.photo?.id ?? ""));
    expect(rows[0]?.deletedAt).toBeNull();
    expect(rows[0]?.isPrimary).toBe(true);
  });

  it("stores photo bytes under the owning household only, without EXIF", async () => {
    const w = await world();
    const rows = await db.select().from(files).where(eq(files.householdId, w.householdA.id));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.storageKey.startsWith(`${w.householdA.id}/`)).toBe(true);
      const bytes = await w.storage.get(row.storageKey);
      if (!bytes) throw new Error("missing bytes");
      expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    }
    expect(await db.select().from(files).where(eq(files.householdId, w.householdB.id))).toEqual([]);
  });
});
