import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { pushSubscriptions } from "@/db/schema";
import { createAuditRepository } from "@/features/audit";
import { setupTestDatabase, TEST_PASSWORD } from "@/test/db";
import { exportPersonalData } from "../server/personal-export";
import { makeDeps, world } from "./fixtures";

const db = setupTestDatabase();

describe("exportPersonalData", () => {
  it("lets every member export their own data, and only with the right password", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    for (const [ctx, user] of [
      [w.ctx.owner, w.ownerA],
      [w.ctx.editor, w.editor],
      [w.ctx.viewer, w.viewer],
    ] as const) {
      const result = await exportPersonalData(parts.deps, ctx, TEST_PASSWORD);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(JSON.parse(result.value.json).account.email).toBe(user.email);
    }
    const wrong = await exportPersonalData(parts.deps, w.ctx.viewer, "nope");
    expect(!wrong.ok && wrong.error.code).toBe("forbidden");
  });

  it("never contains household content or other people's details", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    await db
      .insert(pushSubscriptions)
      .values({
        userId: w.editor.id,
        endpoint: `https://push.example.test/${w.editor.id}`,
        p256dh: "KEY-MATERIAL-P256",
        auth: "KEY-MATERIAL-AUTH",
      })
      .onConflictDoNothing();
    const result = await exportPersonalData(parts.deps, w.ctx.editor, TEST_PASSWORD);
    if (!result.ok) throw new Error("export failed");
    const text = result.value.json;
    const data = JSON.parse(text);

    for (const secret of [
      "SECRET-B",
      "Alpha-A",
      "Kibble A",
      w.ownerA.email,
      w.ownerB.email,
      w.viewer.email,
      "KEY-MATERIAL",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(data.pushDevices).toHaveLength(1);
    expect(data.householdMemberships).toEqual([
      expect.objectContaining({ household: "Household A", role: "editor" }),
    ]);
    expect(Object.keys(data).sort()).toEqual([
      "about",
      "account",
      "auditEntriesAboutYou",
      "generatedAt",
      "householdMemberships",
      "notificationPreferences",
      "pushDevices",
      "signedInSessions",
    ]);
    expect(
      await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, w.editor.id)),
    ).toHaveLength(1);
  });

  it("includes audit entries that name the member and no one else's", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    const audit = createAuditRepository(db, w.ctx.owner);
    await audit.record({
      event: "role_changed",
      actorUserId: w.ownerA.id,
      targetUserId: w.editor.id,
      detail: "editor",
    });
    await audit.record({
      event: "role_changed",
      actorUserId: w.ownerA.id,
      targetUserId: w.viewer.id,
      detail: "viewer",
    });
    const result = await exportPersonalData(parts.deps, w.ctx.editor, TEST_PASSWORD);
    if (!result.ok) throw new Error("export failed");
    const entries: { event: string; detail: string | null }[] = JSON.parse(
      result.value.json,
    ).auditEntriesAboutYou;
    expect(entries.map((e) => e.detail)).toContain("editor");
    expect(entries.map((e) => e.detail)).not.toContain("viewer");

    // Exporting is itself recorded.
    const events = (await createAuditRepository(db, w.ctx.owner).list(50)).filter(
      (e) => e.detail === "personal",
    );
    expect(events.length).toBeGreaterThan(0);
  });

  it("is rate limited", async () => {
    const parts = makeDeps(db);
    const w = await world(db, parts.fileStorage);
    let last: Awaited<ReturnType<typeof exportPersonalData>> | undefined;
    for (let i = 0; i < 6; i++)
      last = await exportPersonalData(parts.deps, w.ctx.viewer, TEST_PASSWORD);
    expect(last && !last.ok && last.error.code).toBe("rate_limited");
  });
});
