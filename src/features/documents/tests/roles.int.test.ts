import { describe, expect, it } from "vitest";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { ctxFor } from "@/features/animals/tests/helpers";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from "../server/service";
import { documentInput, makeDocumentDeps, pdfFile } from "./helpers";

const db = setupTestDatabase();

describe("roles", () => {
  it("viewers can read but not write; editors can write", async () => {
    const w = await seedTwoHouseholds(db);
    const viewer = await createUser(db, { name: "Viewer" });
    const editor = await createUser(db, { name: "Editor" });
    await addMember(db, w.householdA.id, viewer.id, "viewer");
    await addMember(db, w.householdA.id, editor.id, "editor");
    const { deps, storage } = makeDocumentDeps(db);
    const owner = ctxFor(w.ownerA, w.householdA, "owner");
    const viewerCtx = ctxFor(viewer, w.householdA, "viewer");
    const editorCtx = ctxFor(editor, w.householdA, "editor");

    const created = await createDocument(deps, owner, documentInput(), pdfFile());
    if (!created.ok) throw new Error("setup failed");
    const id = created.value.id;

    const list = await listDocuments(deps, viewerCtx, {});
    expect(list.ok && list.value.items.map((d) => d.id)).toEqual([id]);
    expect((await getDocument(deps, viewerCtx, id)).ok).toBe(true);

    const bytesBefore = storage.keys().length;
    const denied = await createDocument(
      deps,
      viewerCtx,
      documentInput(),
      pdfFile("v.pdf", "% viewer\n"),
    );
    expect(!denied.ok && denied.error.code).toBe("forbidden");
    expect(storage.keys().length).toBe(bytesBefore);

    const update = await updateDocument(deps, viewerCtx, id, documentInput({ title: "Nope" }));
    expect(!update.ok && update.error.code).toBe("forbidden");
    const del = await deleteDocument(deps, viewerCtx, id);
    expect(!del.ok && del.error.code).toBe("forbidden");
    const still = await getDocument(deps, viewerCtx, id);
    expect(still.ok && still.value.document.deletedAt).toBeNull();

    const edited = await updateDocument(deps, editorCtx, id, documentInput({ title: "Edited" }));
    expect(edited.ok && edited.value.title).toBe("Edited");
  });
});
