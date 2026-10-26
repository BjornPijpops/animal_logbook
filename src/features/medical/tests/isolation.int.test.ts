import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { medicalRecords, reminders } from "@/db/schema";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { createAttachmentsRepository, createFilesRepository } from "@/features/files";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { createMedicalRepository } from "../server/medical.repository";
import {
  createMedicalRecord,
  deleteMedicalRecord,
  getAllergySummaries,
  getMedicalRecord,
  restoreMedicalRecord,
  updateMedicalRecord,
} from "../server/service";
import { makeMedicalDeps, recordInput } from "./helpers";

const db = setupTestDatabase();
const deps = makeMedicalDeps(db);

async function world() {
  const w = await seedTwoHouseholds(db);
  const ctxA = ctxFor(w.ownerA, w.householdA, "owner");
  const ctxB = ctxFor(w.ownerB, w.householdB, "owner");
  const animalA = await seedAnimal(db, ctxA);
  const animalB = await seedAnimal(db, ctxB);
  const created = await createMedicalRecord(deps, ctxA, recordInput(animalA));
  if (!created.ok) throw new Error("setup failed");
  return { ...w, ctxA, ctxB, animalA, animalB, recordId: created.value.id };
}

async function addFile(householdId: string, userId: string, recordId: string) {
  const id = randomUUID();
  await createFilesRepository(db, householdId).insert({
    id,
    storageKey: `${householdId}/${id}`,
    mimeType: "application/pdf",
    sizeBytes: 10,
    checksumSha256: "a".repeat(64),
    uploadedBy: userId,
  });
  await createAttachmentsRepository(db, householdId).insert(
    { type: "medical_record", id: recordId },
    id,
  );
}

describe("tenant isolation: medical records", () => {
  it("household B cannot read, change, delete or restore household A's record", async () => {
    const w = await world();

    const get = await getMedicalRecord(deps, w.ctxB, w.recordId);
    expect(!get.ok && get.error.code).toBe("not_found");
    const update = await updateMedicalRecord(
      deps,
      w.ctxB,
      w.recordId,
      recordInput(w.animalB, { title: "Hacked" }),
    );
    expect(!update.ok && update.error.code).toBe("not_found");
    const del = await deleteMedicalRecord(deps, w.ctxB, w.recordId);
    expect(!del.ok && del.error.code).toBe("not_found");

    await deleteMedicalRecord(deps, w.ctxA, w.recordId);
    const restore = await restoreMedicalRecord(deps, w.ctxB, w.recordId);
    expect(!restore.ok && restore.error.code).toBe("not_found");

    const [row] = await db.select().from(medicalRecords).where(eq(medicalRecords.id, w.recordId));
    expect(row?.title).toBe("Rabies");
    expect(row?.deletedAt).not.toBeNull();
  });

  it("household B cannot attach a record to household A's animal", async () => {
    const w = await world();
    const result = await createMedicalRecord(deps, w.ctxB, recordInput(w.animalA));
    expect(!result.ok && result.error.code).toBe("not_found");
    expect(
      await db.select().from(medicalRecords).where(eq(medicalRecords.animalId, w.animalA)),
    ).toHaveLength(1);
  });

  it("repository queries are scoped by household", async () => {
    const w = await world();
    expect(await createMedicalRepository(db, w.householdB.id).find(w.recordId)).toBeNull();
    expect(
      await createMedicalRepository(db, w.householdB.id).listUnlinkedVaccinations(w.animalA),
    ).toEqual([]);
    expect(
      await createMedicalRepository(db, w.householdB.id).activeAllergies([w.animalA], "2024-01-01"),
    ).toEqual([]);
  });

  it("allergy summaries never leak across households", async () => {
    const w = await world();
    await createMedicalRecord(
      deps,
      w.ctxA,
      recordInput(w.animalA, { type: "allergy", title: "Chicken", nextDueOn: "" }),
    );
    const leaked = await getAllergySummaries(deps, w.ctxB, [w.animalA]);
    expect(leaked.ok && leaked.value).toEqual({});
  });

  it("another household's delete leaves reminders untouched", async () => {
    const w = await world();
    await deleteMedicalRecord(deps, w.ctxB, w.recordId);
    const rows = await db
      .select()
      .from(reminders)
      .where(and(eq(reminders.sourceId, w.recordId), eq(reminders.householdId, w.householdA.id)));
    expect(rows.every((r) => r.cancelledAt === null)).toBe(true);
  });
});

describe("roles: medical records", () => {
  it("viewers can read but not write; editors can write", async () => {
    const w = await world();
    const viewer = await createUser(db);
    const editor = await createUser(db);
    await addMember(db, w.householdA.id, viewer.id, "viewer");
    await addMember(db, w.householdA.id, editor.id, "editor");
    const viewerCtx = ctxFor(viewer, w.householdA, "viewer");
    const editorCtx = ctxFor(editor, w.householdA, "editor");

    expect((await getMedicalRecord(deps, viewerCtx, w.recordId)).ok).toBe(true);
    expect((await getAllergySummaries(deps, viewerCtx, [w.animalA])).ok).toBe(true);

    const denied = [
      await createMedicalRecord(deps, viewerCtx, recordInput(w.animalA)),
      await updateMedicalRecord(deps, viewerCtx, w.recordId, recordInput(w.animalA)),
      await deleteMedicalRecord(deps, viewerCtx, w.recordId),
      await restoreMedicalRecord(deps, viewerCtx, w.recordId),
    ];
    expect(denied.map((r) => !r.ok && r.error.code)).toEqual([
      "forbidden",
      "forbidden",
      "forbidden",
      "forbidden",
    ]);

    expect((await createMedicalRecord(deps, editorCtx, recordInput(w.animalA))).ok).toBe(true);
  });
});

describe("attachments follow the record", () => {
  it("restores only the files the record's own deletion removed", async () => {
    const w = await world();
    await addFile(w.householdA.id, w.ownerA.id, w.recordId);
    await addFile(w.householdA.id, w.ownerA.id, w.recordId);
    const attachments = createAttachmentsRepository(db, w.householdA.id);
    const owner = { type: "medical_record", id: w.recordId } as const;
    const [first] = await attachments.list(owner);
    if (!first) throw new Error("setup failed");
    await attachments.softDelete(owner, [first.id]);

    await deleteMedicalRecord(deps, w.ctxA, w.recordId);
    expect(await attachments.list(owner)).toEqual([]);

    await restoreMedicalRecord(deps, w.ctxA, w.recordId);
    const after = await attachments.list(owner);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).not.toBe(first.id);
  });
});
