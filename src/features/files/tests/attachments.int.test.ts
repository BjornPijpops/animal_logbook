import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { attachments } from "@/db/schema";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { createAppointment } from "@/features/appointments";
import { appointmentInput } from "@/features/appointments/tests/helpers";
import { makeDocumentDeps, pdfFile, pngFile } from "@/features/documents/tests/helpers";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import {
  addAttachment,
  listAttachments,
  MAX_ATTACHMENTS_PER_OWNER,
  removeAttachment,
} from "../server/attachments.service";

const db = setupTestDatabase();

async function world() {
  const w = await seedTwoHouseholds(db);
  const ctxA = ctxFor(w.ownerA, w.householdA, "owner");
  const ctxB = ctxFor(w.ownerB, w.householdB, "owner");
  const animalA = await seedAnimal(db, ctxA);
  const created = await createAppointment({ db }, ctxA, appointmentInput(animalA));
  if (!created.ok) throw new Error("setup failed");
  const owner = { type: "appointment", id: created.value.id };
  return { ...w, ctxA, ctxB, owner };
}

describe("generic attachments", () => {
  it("attaches several files to one appointment and lists them in order", async () => {
    const w = await world();
    const { deps } = makeDocumentDeps(db);
    expect((await addAttachment(deps, w.ctxA, w.owner, pdfFile("invoice.pdf"))).ok).toBe(true);
    expect((await addAttachment(deps, w.ctxA, w.owner, await pngFile("rx.png"))).ok).toBe(true);
    const listed = await listAttachments(deps, w.ctxA, w.owner);
    expect(listed.ok && listed.value.map((a) => a.originalName)).toEqual(["invoice.pdf", "rx.png"]);
  });

  it("rejects a spoofed file and stores nothing", async () => {
    const w = await world();
    const { deps, storage } = makeDocumentDeps(db);
    const html = {
      data: Buffer.from("<html><script>alert(1)</script></html>"),
      fileName: "x.pdf",
      declaredType: "application/pdf",
    };
    const result = await addAttachment(deps, w.ctxA, w.owner, html);
    expect(!result.ok && result.error.code).toBe("validation");
    expect(storage.keys()).toHaveLength(0);
  });

  it("caps attachments per owner and removes the stored bytes of a rolled back upload", async () => {
    const w = await world();
    const { deps, storage } = makeDocumentDeps(db);
    for (let i = 0; i < MAX_ATTACHMENTS_PER_OWNER; i++) {
      expect((await addAttachment(deps, w.ctxA, w.owner, pdfFile(`f${i}.pdf`, String(i)))).ok).toBe(
        true,
      );
    }
    const before = storage.keys().length;
    const over = await addAttachment(deps, w.ctxA, w.owner, pdfFile("extra.pdf", "x"));
    expect(!over.ok && over.error.code).toBe("conflict");
    expect(storage.keys()).toHaveLength(before);
  });

  it("refuses unknown owners, documents and malformed ids", async () => {
    const w = await world();
    const { deps } = makeDocumentDeps(db);
    for (const owner of [
      { type: "document", id: w.owner.id },
      { type: "appointment", id: "not-a-uuid" },
      { type: "nope", id: w.owner.id },
    ]) {
      const result = await addAttachment(deps, w.ctxA, owner, pdfFile());
      expect(!result.ok && result.error.code).toBe("validation");
    }
  });

  it("removes one attachment and its file", async () => {
    const w = await world();
    const { deps } = makeDocumentDeps(db);
    await addAttachment(deps, w.ctxA, w.owner, pdfFile("a.pdf", "a"));
    await addAttachment(deps, w.ctxA, w.owner, pdfFile("b.pdf", "b"));
    const listed = await listAttachments(deps, w.ctxA, w.owner);
    const first = listed.ok ? listed.value[0] : undefined;
    expect((await removeAttachment(deps, w.ctxA, w.owner, first?.id ?? "")).ok).toBe(true);
    const after = await listAttachments(deps, w.ctxA, w.owner);
    expect(after.ok && after.value.map((a) => a.originalName)).toEqual(["b.pdf"]);
    expect((await removeAttachment(deps, w.ctxA, w.owner, first?.id ?? "")).ok).toBe(false);
  });
});

describe("tenant isolation and roles: attachments", () => {
  it("household B cannot attach to, list or remove from household A's appointment", async () => {
    const w = await world();
    const { deps, storage } = makeDocumentDeps(db);
    await addAttachment(deps, w.ctxA, w.owner, pdfFile("a.pdf", "a"));
    const [row] = await db
      .select()
      .from(attachments)
      .where(
        and(eq(attachments.ownerId, w.owner.id), eq(attachments.householdId, w.householdA.id)),
      );

    const add = await addAttachment(deps, w.ctxB, w.owner, pdfFile("evil.pdf", "e"));
    expect(!add.ok && add.error.code).toBe("not_found");
    expect(storage.keys().filter((k) => k.startsWith(w.householdB.id))).toHaveLength(0);

    const listed = await listAttachments(deps, w.ctxB, w.owner);
    expect(listed.ok && listed.value).toEqual([]);
    const removed = await removeAttachment(deps, w.ctxB, w.owner, row?.id ?? "");
    expect(!removed.ok && removed.error.code).toBe("not_found");
    const still = await listAttachments(deps, w.ctxA, w.owner);
    expect(still.ok && still.value).toHaveLength(1);
  });

  it("viewers can list but not add or remove", async () => {
    const w = await world();
    const { deps } = makeDocumentDeps(db);
    await addAttachment(deps, w.ctxA, w.owner, pdfFile("a.pdf", "a"));
    const viewer = await createUser(db);
    await addMember(db, w.householdA.id, viewer.id, "viewer");
    const ctx = ctxFor(viewer, w.householdA, "viewer");
    const listed = await listAttachments(deps, ctx, w.owner);
    expect(listed.ok && listed.value).toHaveLength(1);
    const add = await addAttachment(deps, ctx, w.owner, pdfFile("b.pdf", "b"));
    expect(!add.ok && add.error.code).toBe("forbidden");
    const remove = await removeAttachment(
      deps,
      ctx,
      w.owner,
      listed.ok ? (listed.value[0]?.id ?? "") : "",
    );
    expect(!remove.ok && remove.error.code).toBe("forbidden");
  });
});
