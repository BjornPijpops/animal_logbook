import { unzipSync } from "fflate";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dataExports } from "@/db/schema";
import { setupTestDatabase, TEST_PASSWORD } from "@/test/db";
import { expireExports, processPendingExports } from "../server/export-jobs";
import { confirmPassword } from "../server/reauth";
import { getExportDownload, listExports, requestExport } from "../server/service";
import { insertReadyExport, makeDeps, world } from "./fixtures";

const db = setupTestDatabase();

function jobDeps(parts: ReturnType<typeof makeDeps>, now: () => Date, ttlHours = 24) {
  return {
    db,
    exportStorage: parts.exportStorage,
    fileStorage: parts.fileStorage,
    ttlHours,
    now,
  };
}

const textOf = (zip: Record<string, Uint8Array>) =>
  Object.values(zip)
    .map((bytes) => Buffer.from(bytes).toString("utf8"))
    .join("\n");

describe("requestExport", () => {
  it("lets only the owner request an export, and only with the right password", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);

    for (const ctx of [w.ctx.editor, w.ctx.viewer]) {
      const denied = await requestExport(parts.deps, ctx, TEST_PASSWORD);
      expect(!denied.ok && denied.error.code).toBe("forbidden");
    }
    const wrong = await requestExport(parts.deps, w.ctx.owner, "not the password");
    expect(!wrong.ok && wrong.error.code).toBe("forbidden");
    expect(await listExports(parts.deps, w.ctx.owner)).toHaveLength(0);

    const ok = await requestExport(parts.deps, w.ctx.owner, TEST_PASSWORD);
    expect(ok.ok).toBe(true);
    const duplicate = await requestExport(parts.deps, w.ctx.owner, TEST_PASSWORD);
    expect(!duplicate.ok && duplicate.error.code).toBe("conflict");
    expect(await listExports(parts.deps, w.ctx.owner)).toHaveLength(1);
    // Nobody else sees the request.
    expect(await listExports(parts.deps, w.ctx.ownerB)).toHaveLength(0);
  });

  it("rate-limits export requests per user", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    for (let i = 0; i < 3; i += 1) {
      const result = await requestExport(parts.deps, w.ctx.owner, "wrong");
      expect(!result.ok && result.error.code).toBe("forbidden");
    }
    const blocked = await requestExport(parts.deps, w.ctx.owner, TEST_PASSWORD);
    expect(!blocked.ok && blocked.error.code).toBe("rate_limited");
  });

  it("audits failed confirmations and the request itself", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    await requestExport(parts.deps, w.ctx.owner, "wrong");
    await requestExport(parts.deps, w.ctx.owner, TEST_PASSWORD);
    const { createAuditRepository } = await import("@/features/audit");
    const events = (await createAuditRepository(db, w.ctx.owner).list(20)).map((e) => e.event);
    expect(events).toEqual(expect.arrayContaining(["reauth_failed", "export_requested"]));
  });
});

describe("password confirmation", () => {
  it("rate-limits wrong passwords per user, even for a correct one afterwards", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const ctx = { userId: w.ownerA.id, householdId: w.householdA.id };
    for (let i = 0; i < 5; i += 1) {
      const result = await confirmPassword(parts.deps, ctx, "wrong");
      expect(!result.ok && result.error.code).toBe("forbidden");
    }
    const blocked = await confirmPassword(parts.deps, ctx, TEST_PASSWORD);
    expect(!blocked.ok && blocked.error.code).toBe("rate_limited");
    expect(
      (await confirmPassword(parts.deps, { ...ctx, userId: w.editor.id }, TEST_PASSWORD)).ok,
    ).toBe(true);
  });
});

describe("export worker", () => {
  it("builds a zip with only this household's data, even though the worker can read every row", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const requested = await requestExport(parts.deps, w.ctx.owner, TEST_PASSWORD);
    expect(requested.ok).toBe(true);

    const now = new Date("2031-03-01T10:00:00Z");
    const result = await processPendingExports(jobDeps(parts, () => now));
    expect(result.ready).toBeGreaterThanOrEqual(1);

    const [row] = await listExports(parts.deps, w.ctx.owner);
    expect(row?.status).toBe("ready");
    expect(row?.expiresAt?.toISOString()).toBe("2031-03-02T10:00:00.000Z");

    const download = await getExportDownload(parts.deps, w.ctx.owner, row?.id ?? "");
    expect(download.ok).toBe(true);
    if (!download.ok) return;
    const zip = unzipSync(new Uint8Array(download.value.data));
    const names = Object.keys(zip);
    expect(names).toEqual(
      expect.arrayContaining([
        "README.txt",
        "data/animals.json",
        "data/expenses.json",
        "profile.json",
      ]),
    );
    const everything = textOf(zip);
    expect(everything).toContain("Alpha-A");
    expect(everything).toContain("Kibble A");
    expect(everything).toContain("bytes-of-household-a");
    expect(everything).not.toContain("SECRET-B");
    expect(everything).not.toContain(w.householdB.id);
    expect(everything).not.toContain(w.ownerB.email);
    // Other members' email addresses are not exported, only the requester's own.
    expect(everything).not.toContain(w.editor.email);
    expect(everything).toContain(w.ownerA.email);
    expect(names.some((name) => name.includes(w.fileB.id))).toBe(false);
    expect(names.some((name) => name.includes(w.fileA.id))).toBe(true);
  });

  it("running the worker twice builds the export once", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    await requestExport(parts.deps, w.ctx.owner, TEST_PASSWORD);
    const now = new Date("2031-03-01T10:00:00Z");
    const [a, b] = await Promise.all([
      processPendingExports(jobDeps(parts, () => now)),
      processPendingExports(jobDeps(parts, () => now)),
    ]);
    const again = await processPendingExports(jobDeps(parts, () => now));
    expect(a.ready + b.ready).toBeGreaterThanOrEqual(1);
    expect(again.ready).toBe(0);
    const rows = await db.select().from(dataExports).where(eq(dataExports.userId, w.ownerA.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("ready");
    expect(parts.exportStorage.keys().filter((key) => key.startsWith(w.ownerA.id))).toHaveLength(1);
  });
});

describe("download access", () => {
  it("is limited to the requester, to ready and unexpired exports", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const key = `${w.ownerA.id}/${crypto.randomUUID()}`;
    await parts.exportStorage.put(key, Buffer.from("zip-bytes"));
    const now = new Date("2031-03-01T10:00:00Z");
    const row = await insertReadyExport(db, {
      userId: w.ownerA.id,
      householdId: w.householdA.id,
      storageKey: key,
      expiresAt: new Date("2031-03-02T10:00:00Z"),
    });
    const at = makeDeps(db, () => now).deps;
    const deps = { ...at, exportStorage: parts.exportStorage };

    expect((await getExportDownload(deps, w.ctx.owner, row.id)).ok).toBe(true);
    // Another household's owner, and a member of the same household, get nothing.
    for (const ctx of [w.ctx.ownerB, w.ctx.editor, w.ctx.viewer]) {
      expect((await getExportDownload(deps, ctx, row.id)).ok).toBe(false);
    }
    const late = { ...deps, now: () => new Date("2031-03-02T10:00:01Z") };
    const expired = await getExportDownload(late, w.ctx.owner, row.id);
    expect(!expired.ok && expired.error.code).toBe("not_found");
  });

  it("does not let the owner of another household reach the row even by id", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const key = `${w.ownerA.id}/${crypto.randomUUID()}`;
    await parts.exportStorage.put(key, Buffer.from("zip-bytes"));
    const row = await insertReadyExport(db, {
      userId: w.ownerA.id,
      householdId: w.householdA.id,
      storageKey: key,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const forged = { ...w.ctx.ownerB, householdId: w.householdA.id };
    expect((await getExportDownload(parts.deps, forged, row.id)).ok).toBe(false);
  });
});

describe("export expiry", () => {
  it("deletes expired zips, gives up on stuck requests and sweeps stray zips; repeat runs are no-ops", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const now = new Date("2031-06-01T00:00:00Z");

    const key = `${w.ownerA.id}/${crypto.randomUUID()}`;
    await parts.exportStorage.put(key, Buffer.from("old"));
    const ready = await insertReadyExport(db, {
      userId: w.ownerA.id,
      householdId: w.householdA.id,
      storageKey: key,
      expiresAt: new Date("2031-05-31T00:00:00Z"),
    });
    const [stuck] = await db
      .insert(dataExports)
      .values({
        userId: w.ownerB.id,
        householdId: w.householdB.id,
        status: "processing",
        requestedAt: new Date("2031-05-31T22:00:00Z"),
      })
      .returning();
    const strayKey = `${w.ownerB.id}/${crypto.randomUUID()}`;
    await parts.exportStorage.put(strayKey, Buffer.from("stray"));
    parts.exportStorage.setModifiedAt(strayKey, new Date("2031-05-31T00:00:00Z"));

    const first = await expireExports({ db, exportStorage: parts.exportStorage, now: () => now });
    expect(first.expired).toBeGreaterThanOrEqual(1);
    expect(first.stale).toBeGreaterThanOrEqual(1);
    expect(await parts.exportStorage.exists(key)).toBe(false);
    expect(await parts.exportStorage.exists(strayKey)).toBe(false);
    const [after] = await db.select().from(dataExports).where(eq(dataExports.id, ready.id));
    expect(after?.status).toBe("expired");
    expect(after?.storageKey).toBeNull();
    const [stale] = await db
      .select()
      .from(dataExports)
      .where(eq(dataExports.id, stuck?.id ?? ""));
    expect(["failed", "expired"]).toContain(stale?.status);

    const second = await expireExports({ db, exportStorage: parts.exportStorage, now: () => now });
    expect(second.expired + second.stale + second.strayFiles).toBe(0);
  });
});
