import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { documents, files } from "@/db/schema";
import { animalInput, ctxFor, makeAnimalDeps } from "@/features/animals/tests/helpers";
import { createAnimal } from "@/features/animals/server/service";
import { seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import type { ScanResult, VirusScanner } from "@/lib/uploads/virus-scanner";
import { createDocument, deleteDocument, getDocument, listDocuments } from "../server/service";
import { documentInput, makeDocumentDeps, pdfFile, pngFile } from "./helpers";

const db = setupTestDatabase();

const fakeScanner = (verdict: ScanResult | Error): VirusScanner & { calls: number } => ({
  calls: 0,
  async scan() {
    this.calls++;
    if (verdict instanceof Error) throw verdict;
    return verdict;
  },
});

async function setup(overrides: Parameters<typeof makeDocumentDeps>[1] = {}) {
  const w = await seedTwoHouseholds(db);
  const made = makeDocumentDeps(db, overrides);
  return { ...made, w, ctx: ctxFor(w.ownerA, w.householdA, "owner") };
}

describe("document uploads", () => {
  it("stores metadata, checksum, mime type and uploader", async () => {
    const { deps, storage, w, ctx } = await setup();
    const created = await createDocument(
      deps,
      ctx,
      documentInput({ type: "passport", expiresOn: "2030-02-28" }),
      pdfFile("My Passport.pdf"),
    );
    if (!created.ok) throw new Error(created.error.message);
    const detail = await getDocument(deps, ctx, created.value.id);
    if (!detail.ok) throw new Error("detail failed");
    const [attachment] = detail.value.attachments;
    expect(attachment).toMatchObject({
      originalName: "My Passport.pdf",
      mimeType: "application/pdf",
    });
    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.id, attachment?.fileId ?? ""));
    expect(file?.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(file?.uploadedBy).toBe(w.ownerA.id);
    expect(file?.storageKey.startsWith(`${w.householdA.id}/`)).toBe(true);
    expect(storage.keys()).toEqual([file?.storageKey]);
  });

  it.each([
    ["svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "x.svg", "image/svg+xml"],
    ["html", Buffer.from("<html><script>1</script></html>"), "x.pdf", "application/pdf"],
    ["text", Buffer.from("just text"), "x.pdf", "application/pdf"],
  ])("rejects %s and stores nothing", async (_name, data, fileName, declaredType) => {
    const { deps, storage, ctx, w } = await setup();
    const result = await createDocument(deps, ctx, documentInput(), {
      data,
      fileName,
      declaredType,
    });
    expect(!result.ok && result.error.message).toBe("unsupported_type");
    expect(storage.keys()).toEqual([]);
    expect(
      await db.select().from(documents).where(eq(documents.householdId, w.householdA.id)),
    ).toEqual([]);
  });

  it("rejects a PNG renamed to .pdf and a PDF declared as an image", async () => {
    const { deps, ctx } = await setup();
    const png = await pngFile("fake.pdf");
    const a = await createDocument(deps, ctx, documentInput(), {
      ...png,
      declaredType: "application/pdf",
    });
    expect(!a.ok && a.error.message).toBe("type_mismatch");
    const b = await createDocument(deps, ctx, documentInput(), {
      ...pdfFile("real.pdf"),
      declaredType: "image/png",
    });
    expect(!b.ok && b.error.message).toBe("type_mismatch");
  });

  it("enforces the maximum file size", async () => {
    const { deps, ctx } = await setup({ maxUploadBytes: 20 });
    const result = await createDocument(deps, ctx, documentInput(), pdfFile());
    expect(!result.ok && result.error.message).toBe("too_large");
  });

  it("enforces the household storage quota and ignores deleted files", async () => {
    const first = pdfFile("a.pdf", "% one\n");
    const { deps, storage, ctx } = await setup({ householdQuotaBytes: first.data.byteLength + 20 });
    const a = await createDocument(deps, ctx, documentInput(), first);
    if (!a.ok) throw new Error("first upload should fit");

    const over = await createDocument(deps, ctx, documentInput(), pdfFile("b.pdf", "% two two\n"));
    expect(!over.ok && over.error.message).toBe("quota_exceeded");
    expect(storage.keys()).toHaveLength(1);

    await deleteDocument(deps, ctx, a.value.id);
    const again = await createDocument(deps, ctx, documentInput(), pdfFile("c.pdf", "% three\n"));
    expect(again.ok).toBe(true);
  });

  it("rolls back and removes the bytes if the transaction fails", async () => {
    const { deps, storage, ctx, w } = await setup();
    const result = await createDocument(
      deps,
      ctx,
      documentInput({ animalId: "00000000-0000-4000-8000-000000000000" }),
      pdfFile(),
    );
    expect(result.ok).toBe(false);
    expect(storage.keys()).toEqual([]);
    expect(await db.select().from(files).where(eq(files.householdId, w.householdA.id))).toEqual([]);
  });

  it("blocks infected files and fails closed when the scanner is down", async () => {
    const infected = fakeScanner({ status: "infected", signature: "Eicar" });
    const a = await setup({ scanner: infected });
    const blocked = await createDocument(a.deps, a.ctx, documentInput(), pdfFile());
    expect(!blocked.ok && blocked.error.message).toBe("infected");
    expect(a.storage.keys()).toEqual([]);
    expect(infected.calls).toBe(1);

    const down = fakeScanner(new Error("connection refused"));
    const b = await setup({ scanner: down });
    const unavailable = await createDocument(b.deps, b.ctx, documentInput(), pdfFile());
    expect(!unavailable.ok && unavailable.error.message).toBe("scan_unavailable");
    expect(b.storage.keys()).toEqual([]);

    const clean = fakeScanner({ status: "clean" });
    const c = await setup({ scanner: clean });
    expect((await createDocument(c.deps, c.ctx, documentInput(), pdfFile())).ok).toBe(true);
  });
});

describe("listing, search and filters", () => {
  it("filters by animal, household-level, type, expiry and text; paginates", async () => {
    const { deps, ctx, w } = await setup();
    const animals = makeAnimalDeps(db);
    const animal = await createAnimal(animals.deps, ctx, animalInput({ name: "Rex" }));
    if (!animal.ok) throw new Error("animal failed");
    const soon = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 200 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const make = async (n: number, input: Parameters<typeof documentInput>[0]) => {
      const result = await createDocument(
        deps,
        ctx,
        documentInput(input),
        pdfFile(`f${n}.pdf`, `% ${n}\n`),
      );
      if (!result.ok) throw new Error(result.error.message);
    };
    await make(1, {
      title: "Rex passport",
      type: "passport",
      animalId: animal.value.id,
      expiresOn: soon,
    });
    await make(2, { title: "Insurance 100%", type: "insurance", expiresOn: later });
    await make(3, { title: "Vet invoice", type: "invoice", notes: "Dental cleaning" });

    const ids = async (query: unknown) => {
      const result = await listDocuments(deps, ctx, query);
      if (!result.ok) throw new Error("list failed");
      return result.value.items.map((d) => d.title).sort();
    };
    expect(await ids({})).toHaveLength(3);
    expect(await ids({ animal: animal.value.id })).toEqual(["Rex passport"]);
    expect(await ids({ animal: "household" })).toEqual(["Insurance 100%", "Vet invoice"]);
    expect(await ids({ type: "insurance" })).toEqual(["Insurance 100%"]);
    expect(await ids({ expiring: true })).toEqual(["Rex passport"]);
    expect(await ids({ q: "dental" })).toEqual(["Vet invoice"]);
    expect(await ids({ q: "f2.pdf" })).toEqual(["Insurance 100%"]);
    expect(await ids({ q: "100%" })).toEqual(["Insurance 100%"]);
    expect(await ids({ q: "%" })).toEqual(["Insurance 100%"]);
    expect(await ids({ q: "_" })).toEqual([]);
    expect((await listDocuments(deps, ctx, { type: "bogus" })).ok).toBe(false);

    const page2 = await listDocuments(deps, ctx, { page: 2 });
    expect(page2.ok && page2.value).toMatchObject({ items: [], total: 3, pageCount: 1 });
    expect(w.householdA.id).toBeTruthy();
  });

  it("hides soft-deleted documents and their files", async () => {
    const { deps, ctx } = await setup();
    const created = await createDocument(deps, ctx, documentInput(), pdfFile());
    if (!created.ok) throw new Error("setup");
    expect((await deleteDocument(deps, ctx, created.value.id)).ok).toBe(true);
    const list = await listDocuments(deps, ctx, {});
    expect(list.ok && list.value.total).toBe(0);
    expect((await getDocument(deps, ctx, created.value.id)).ok).toBe(false);
    expect((await deleteDocument(deps, ctx, created.value.id)).ok).toBe(false);
  });
});
