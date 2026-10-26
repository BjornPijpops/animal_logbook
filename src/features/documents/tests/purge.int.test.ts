import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { attachments, documents, files } from "@/db/schema";
import { ctxFor, jpegWithGps, makeAnimalDeps, animalInput } from "@/features/animals/tests/helpers";
import { addPhoto, createAnimal, deletePhoto } from "@/features/animals/server/service";
import { purgeFiles } from "@/features/files";
import { seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { createDocument, deleteDocument } from "../server/service";
import { documentInput, makeDocumentDeps, pdfFile } from "./helpers";

const db = setupTestDatabase();
const DAY = 24 * 3600 * 1000;

async function setup() {
  const w = await seedTwoHouseholds(db);
  const { deps, storage } = makeDocumentDeps(db);
  return { w, deps, storage, ctxA: ctxFor(w.ownerA, w.householdA, "owner") };
}

const fileRows = (householdId: string) =>
  db.select().from(files).where(eq(files.householdId, householdId));

async function orphan(
  storage: ReturnType<typeof makeDocumentDeps>["storage"],
  householdId: string,
  ownerId: string,
) {
  const id = randomUUID();
  const storageKey = `${householdId}/${id}`;
  await storage.put(storageKey, Buffer.from("orphan"));
  await db.insert(files).values({
    id,
    householdId,
    storageKey,
    mimeType: "application/pdf",
    sizeBytes: 6,
    checksumSha256: "0".repeat(64),
    uploadedBy: ownerId,
  });
  return { id, storageKey };
}

describe("purgeFiles", () => {
  it("removes soft-deleted documents and files only after the retention period", async () => {
    const { w, deps, storage, ctxA } = await setup();
    const created = await createDocument(deps, ctxA, documentInput(), pdfFile());
    if (!created.ok) throw new Error("setup");
    await deleteDocument(deps, ctxA, created.value.id);
    const [file] = await fileRows(w.householdA.id);
    expect(file?.deletedAt).not.toBeNull();

    const early = await purgeFiles({ db, storage }, { now: new Date(), retentionDays: 30 });
    expect(early.files).toBe(0);
    expect(storage.keys()).toHaveLength(1);

    const later = new Date(Date.now() + 31 * DAY);
    const report = await purgeFiles({ db, storage }, { now: later, retentionDays: 30 });
    expect(report.files).toBeGreaterThanOrEqual(1);
    expect(storage.keys()).toEqual([]);
    expect(await fileRows(w.householdA.id)).toEqual([]);
    expect(
      await db.select().from(documents).where(eq(documents.householdId, w.householdA.id)),
    ).toEqual([]);
    expect(
      await db.select().from(attachments).where(eq(attachments.householdId, w.householdA.id)),
    ).toEqual([]);
  });

  it("keeps live documents and photos, removes orphans and stray bytes, and is idempotent", async () => {
    const { w, deps, storage, ctxA } = await setup();
    const doc = await createDocument(deps, ctxA, documentInput(), pdfFile());
    if (!doc.ok) throw new Error("setup");
    const animals = makeAnimalDeps(db);
    const animal = await createAnimal(animals.deps, ctxA, animalInput());
    if (!animal.ok) throw new Error("animal");
    const photo = await addPhoto(
      { ...animals.deps, storage },
      ctxA,
      animal.value.id,
      await jpegWithGps(),
    );
    if (!photo.ok) throw new Error("photo");

    const lost = await orphan(storage, w.householdA.id, w.ownerA.id);
    const fresh = await orphan(storage, w.householdA.id, w.ownerA.id);
    const strayKey = `${w.householdA.id}/${randomUUID()}`;
    await storage.put(strayKey, Buffer.from("stray"));
    storage.setModifiedAt(strayKey, new Date(Date.now() - 3 * DAY));
    await db
      .update(files)
      .set({ createdAt: new Date(Date.now() - 3 * DAY) })
      .where(eq(files.id, lost.id));

    const opts = { now: new Date(), retentionDays: 30 };
    const first = await purgeFiles({ db, storage }, opts);
    expect(first.files).toBeGreaterThanOrEqual(1);
    expect(first.strayBytes).toBeGreaterThanOrEqual(1);
    expect(await storage.exists(lost.storageKey)).toBe(false);
    expect(await storage.exists(strayKey)).toBe(false);
    // Recent unreferenced uploads may still be in flight, so they survive the grace period.
    expect(await storage.exists(fresh.storageKey)).toBe(true);

    const remaining = await fileRows(w.householdA.id);
    expect(remaining).toHaveLength(1 + 2 + 1);
    for (const row of remaining) expect(await storage.exists(row.storageKey)).toBe(true);

    const second = await purgeFiles({ db, storage }, opts);
    expect(second).toEqual({ documents: 0, files: 0, strayBytes: 0 });
  });

  it("removes the bytes of deleted photos once retention has passed, across households", async () => {
    const { w, storage, ctxA } = await setup();
    const animals = makeAnimalDeps(db);
    const deps = { ...animals.deps, storage };
    const animal = await createAnimal(deps, ctxA, animalInput());
    if (!animal.ok) throw new Error("animal");
    await addPhoto(deps, ctxA, animal.value.id, await jpegWithGps());

    const other = ctxFor(w.ownerB, w.householdB, "owner");
    const otherAnimal = await createAnimal(deps, other, animalInput());
    if (!otherAnimal.ok) throw new Error("animal b");
    await addPhoto(deps, other, otherAnimal.value.id, await jpegWithGps());
    const keysBefore = storage.keys().length;
    expect(keysBefore).toBe(4);

    const [photo] = await db.query.animalPhotos.findMany({
      where: (t, { eq: is }) => is(t.householdId, w.householdA.id),
    });
    if (!photo) throw new Error("no photo");
    await deletePhoto(deps, ctxA, animal.value.id, photo.id);
    await purgeFiles({ db, storage }, { now: new Date(Date.now() + 31 * DAY), retentionDays: 30 });
    expect(storage.keys().filter((k) => k.startsWith(w.householdB.id))).toHaveLength(2);
  });
});
