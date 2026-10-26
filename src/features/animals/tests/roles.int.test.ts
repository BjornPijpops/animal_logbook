import { describe, expect, it } from "vitest";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { getFileForUser } from "@/features/files";
import {
  addPhoto,
  addWeight,
  createAnimal,
  deleteAnimal,
  deletePhoto,
  deleteWeight,
  getAnimalOverview,
  getEmergencyCard,
  listAnimals,
  setPrimaryPhoto,
  updateAnimal,
} from "../server/service";
import { animalInput, ctxFor, jpegWithGps, makeAnimalDeps } from "./helpers";

const db = setupTestDatabase();

describe("roles", () => {
  it("viewers can read but not write; editors can write", async () => {
    const w = await seedTwoHouseholds(db);
    const viewer = await createUser(db, { name: "Viewer" });
    const editor = await createUser(db, { name: "Editor" });
    await addMember(db, w.householdA.id, viewer.id, "viewer");
    await addMember(db, w.householdA.id, editor.id, "editor");
    const { deps } = makeAnimalDeps(db);
    const owner = ctxFor(w.ownerA, w.householdA, "owner");
    const viewerCtx = ctxFor(viewer, w.householdA, "viewer");
    const editorCtx = ctxFor(editor, w.householdA, "editor");

    const created = await createAnimal(deps, owner, animalInput());
    if (!created.ok) throw new Error("setup");
    const id = created.value.id;
    const uploaded = await addPhoto(deps, owner, id, await jpegWithGps());
    if (!uploaded.ok) throw new Error("setup photo");
    const weight = await addWeight(deps, owner, id, {
      weight: 8,
      unit: "kg",
      measuredOn: "2024-02-01",
      note: "",
    });
    if (!weight.ok) throw new Error("setup weight");
    const overview = await getAnimalOverview(deps, owner, id);
    const photoId = overview.ok ? (overview.value.photos[0]?.id ?? "") : "";

    // reads
    expect((await listAnimals(deps, viewerCtx)).ok).toBe(true);
    expect((await getAnimalOverview(deps, viewerCtx, id)).ok).toBe(true);
    expect((await getEmergencyCard(deps, viewerCtx, id)).ok).toBe(true);

    // writes
    const denied = [
      await createAnimal(deps, viewerCtx, animalInput()),
      await updateAnimal(deps, viewerCtx, id, animalInput()),
      await deleteAnimal(deps, viewerCtx, id),
      await addPhoto(deps, viewerCtx, id, await jpegWithGps()),
      await setPrimaryPhoto(deps, viewerCtx, id, photoId),
      await deletePhoto(deps, viewerCtx, id, photoId),
      await addWeight(deps, viewerCtx, id, {
        weight: 9,
        unit: "kg",
        measuredOn: "2024-02-02",
        note: "",
      }),
      await deleteWeight(deps, viewerCtx, id, weight.value.id),
    ];
    for (const result of denied) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("forbidden");
    }
    const after = await getAnimalOverview(deps, owner, id);
    expect(after.ok && after.value.weights).toHaveLength(1);
    expect(after.ok && after.value.photos).toHaveLength(1);

    expect((await createAnimal(deps, editorCtx, animalInput())).ok).toBe(true);
    expect((await updateAnimal(deps, editorCtx, id, animalInput({ name: "Edited" }))).ok).toBe(
      true,
    );
  });

  it("viewers can fetch files; outsiders and other households cannot", async () => {
    const w = await seedTwoHouseholds(db);
    const viewer = await createUser(db, { name: "Viewer" });
    const outsider = await createUser(db, { name: "Outsider" });
    await addMember(db, w.householdA.id, viewer.id, "viewer");
    const { deps, storage } = makeAnimalDeps(db);
    const owner = ctxFor(w.ownerA, w.householdA, "owner");
    const created = await createAnimal(deps, owner, animalInput());
    if (!created.ok) throw new Error("setup");
    await addPhoto(deps, owner, created.value.id, await jpegWithGps());
    const overview = await getAnimalOverview(deps, owner, created.value.id);
    const photo = overview.ok ? overview.value.photos[0] : undefined;
    if (!photo) throw new Error("no photo");

    const fileDeps = { db, storage };
    for (const user of [w.ownerA, viewer]) {
      const result = await getFileForUser(fileDeps, user.id, photo.fileId);
      expect(result.ok).toBe(true);
      const thumb = await getFileForUser(fileDeps, user.id, photo.thumbFileId);
      expect(thumb.ok).toBe(true);
    }
    for (const user of [w.ownerB, outsider]) {
      const result = await getFileForUser(fileDeps, user.id, photo.fileId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("not_found");
    }
    const garbage = await getFileForUser(fileDeps, w.ownerA.id, "../../etc/passwd");
    expect(garbage.ok).toBe(false);
  });
});
