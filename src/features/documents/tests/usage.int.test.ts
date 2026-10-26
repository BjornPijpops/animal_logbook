import { describe, expect, it } from "vitest";
import { ctxFor } from "@/features/animals/tests/helpers";
import { getStorageUsage } from "@/features/files";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { createDocument, deleteDocument } from "../server/service";
import { documentInput, makeDocumentDeps, pdfFile } from "./helpers";

const db = setupTestDatabase();

describe("storage usage", () => {
  it("counts only this household's live files and drops deleted ones", async () => {
    const w = await seedTwoHouseholds(db);
    const { deps } = makeDocumentDeps(db);
    const ctxA = ctxFor(w.ownerA, w.householdA, "owner");
    const ctxB = ctxFor(w.ownerB, w.householdB, "owner");
    const quota = { db, householdQuotaBytes: 1_000_000 };

    const empty = await getStorageUsage(quota, ctxA);
    expect(empty.ok && empty.value.usedBytes).toBe(0);

    const created = await createDocument(deps, ctxA, documentInput(), pdfFile());
    if (!created.ok) throw new Error("setup failed");

    const a = await getStorageUsage(quota, ctxA);
    const b = await getStorageUsage(quota, ctxB);
    expect(a.ok && a.value.usedBytes).toBeGreaterThan(0);
    expect(b.ok && b.value.usedBytes).toBe(0);

    await deleteDocument(deps, ctxA, created.value.id);
    const after = await getStorageUsage(quota, ctxA);
    expect(after.ok && after.value.usedBytes).toBe(0);
  });

  it("caps the percentage at 100 and lets viewers read", async () => {
    const w = await seedTwoHouseholds(db);
    const viewer = await createUser(db);
    await addMember(db, w.householdA.id, viewer.id, "viewer");
    const { deps } = makeDocumentDeps(db);
    const owner = ctxFor(w.ownerA, w.householdA, "owner");
    const created = await createDocument(deps, owner, documentInput(), pdfFile());
    if (!created.ok) throw new Error("setup failed");

    const usage = await getStorageUsage(
      { db, householdQuotaBytes: 10 },
      ctxFor(viewer, w.householdA, "viewer"),
    );
    expect(usage.ok && usage.value.percent).toBe(100);
  });
});
