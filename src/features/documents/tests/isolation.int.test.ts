import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { attachments, documents, files } from "@/db/schema";
import { animalInput, ctxFor } from "@/features/animals/tests/helpers";
import { createAnimal, getAnimalOverview } from "@/features/animals/server/service";
import { makeAnimalDeps } from "@/features/animals/tests/helpers";
import {
  createAttachmentsRepository,
  createFilesRepository,
  getFileForUser,
} from "@/features/files";
import { seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { createDocumentsRepository } from "../server/documents.repository";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from "../server/service";
import { documentInput, makeDocumentDeps, pdfFile } from "./helpers";

const db = setupTestDatabase();

async function world() {
  const w = await seedTwoHouseholds(db);
  const { deps, storage } = makeDocumentDeps(db);
  const ctxA = ctxFor(w.ownerA, w.householdA, "owner");
  const ctxB = ctxFor(w.ownerB, w.householdB, "owner");
  const created = await createDocument(deps, ctxA, documentInput({ title: "Secret A" }), pdfFile());
  if (!created.ok) throw new Error(`setup failed: ${created.error.message}`);
  const detail = await getDocument(deps, ctxA, created.value.id);
  if (!detail.ok) throw new Error("detail failed");
  return { ...w, deps, storage, ctxA, ctxB, docId: created.value.id, detail: detail.value };
}

describe("tenant isolation: documents, attachments and files", () => {
  it("household B cannot see, change or delete household A's documents", async () => {
    const w = await world();

    const list = await listDocuments(w.deps, w.ctxB, { q: "Secret" });
    if (!list.ok) throw new Error("list failed");
    expect(list.value.items).toEqual([]);

    const get = await getDocument(w.deps, w.ctxB, w.docId);
    expect(!get.ok && get.error.code).toBe("not_found");
    const update = await updateDocument(
      w.deps,
      w.ctxB,
      w.docId,
      documentInput({ title: "Hacked" }),
    );
    expect(!update.ok && update.error.code).toBe("not_found");
    const del = await deleteDocument(w.deps, w.ctxB, w.docId);
    expect(!del.ok && del.error.code).toBe("not_found");

    const [row] = await db.select().from(documents).where(eq(documents.id, w.docId));
    expect(row?.title).toBe("Secret A");
    expect(row?.deletedAt).toBeNull();
  });

  it("repositories scoped to B never return or modify A's rows", async () => {
    const w = await world();
    const docsB = createDocumentsRepository(db, w.householdB.id);
    expect(await docsB.find(w.docId)).toBeNull();
    expect(await docsB.softDelete(w.docId)).toBe(false);
    expect(
      await docsB.update(w.docId, {
        type: "other",
        title: "x",
        notes: null,
        expiresOn: null,
        animalId: null,
      }),
    ).toBeNull();

    const owner = { type: "document", id: w.docId } as const;
    const attachmentsB = createAttachmentsRepository(db, w.householdB.id);
    expect(await attachmentsB.list(owner)).toEqual([]);
    expect(await attachmentsB.softDelete(owner)).toEqual([]);

    const fileId = w.detail.attachments[0]?.fileId ?? "";
    const filesB = createFilesRepository(db, w.householdB.id);
    expect(await filesB.find(fileId)).toBeNull();
    expect(await filesB.usedBytes()).toBe(0);

    const [att] = await db.select().from(attachments).where(eq(attachments.fileId, fileId));
    expect(att?.deletedAt).toBeNull();
    const [file] = await db.select().from(files).where(eq(files.id, fileId));
    expect(file?.deletedAt).toBeNull();
  });

  it("the file route service answers not_found for another household's file", async () => {
    const w = await world();
    const fileId = w.detail.attachments[0]?.fileId ?? "";
    const deps = { db, storage: w.storage };
    const own = await getFileForUser(deps, w.ownerA.id, fileId);
    expect(own.ok).toBe(true);
    const foreign = await getFileForUser(deps, w.ownerB.id, fileId);
    expect(!foreign.ok && foreign.error.code).toBe("not_found");
  });

  it("cannot link a document to another household's animal", async () => {
    const w = await world();
    const animals = makeAnimalDeps(db);
    const animal = await createAnimal(animals.deps, w.ctxB, animalInput());
    if (!animal.ok) throw new Error("animal failed");
    const before = w.storage.keys().length;

    const created = await createDocument(
      w.deps,
      w.ctxA,
      documentInput({ animalId: animal.value.id }),
      pdfFile("other.pdf", "% different bytes\n"),
    );
    expect(!created.ok && created.error.code).toBe("validation");
    expect(w.storage.keys().length).toBe(before);

    const update = await updateDocument(
      w.deps,
      w.ctxA,
      w.docId,
      documentInput({ animalId: animal.value.id }),
    );
    expect(!update.ok && update.error.code).toBe("validation");
    expect((await getAnimalOverview(animals.deps, w.ctxB, animal.value.id)).ok).toBe(true);
  });
});
