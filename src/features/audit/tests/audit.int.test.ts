import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { scopeDb } from "@/db/scope";
import { auditLog } from "@/db/schema";
import { ctxFor } from "@/features/animals/tests/helpers";
import {
  acceptInvite,
  changeMemberRole,
  inviteMember,
  leaveHousehold,
  removeMember,
  revokeInvite,
  transferOwnership,
} from "@/features/households/server/service";
import { createPostgresRateLimiter } from "@/lib/security/rate-limit";
import {
  addMember,
  createFakeMailer,
  createUser,
  seedTwoHouseholds,
  setupTestDatabase,
} from "@/test/db";
import { createAuditRepository } from "../server/repository";
import { purgeAuditLog } from "../server/retention";
import { listAuditLog } from "../server/service";

const db = setupTestDatabase();
const mailer = createFakeMailer();
const deps = { db, mailer, limiter: createPostgresRateLimiter(db), appUrl: "http://test" };

async function world() {
  const base = await seedTwoHouseholds(db);
  const editor = await createUser(db);
  const viewer = await createUser(db);
  await addMember(db, base.householdA.id, editor.id, "editor");
  await addMember(db, base.householdA.id, viewer.id, "viewer");
  return {
    ...base,
    editor,
    viewer,
    ownerCtx: ctxFor(base.ownerA, base.householdA, "owner"),
    editorCtx: ctxFor(editor, base.householdA, "editor"),
    viewerCtx: ctxFor(viewer, base.householdA, "viewer"),
    ownerBCtx: ctxFor(base.ownerB, base.householdB, "owner"),
  };
}

describe("audit log events", () => {
  it("records membership, role and invite changes without medical content", async () => {
    const w = await world();
    const invited = await inviteMember(deps, w.ownerCtx, {
      email: "new@example.test",
      role: "viewer",
    });
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;
    expect((await revokeInvite(deps, w.ownerCtx, invited.value.id)).ok).toBe(true);
    expect((await changeMemberRole(deps, w.ownerCtx, w.viewer.id, "editor")).ok).toBe(true);
    expect((await removeMember(deps, w.ownerCtx, w.viewer.id)).ok).toBe(true);

    const log = await createAuditRepository(db, w.ownerCtx).list(100);
    expect(log.map((entry) => entry.event).sort()).toEqual(
      ["invite_revoked", "invite_sent", "member_removed", "role_changed"].sort(),
    );
    expect(log.find((entry) => entry.event === "role_changed")?.detail).toBe("editor");
    expect(JSON.stringify(log)).not.toContain("new@example.test");
  });

  it("records an accepted invitation, a leave and an ownership transfer", async () => {
    const w = await world();
    const guest = await createUser(db, { email: `guest-${Date.now()}@example.test` });
    mailer.sent.length = 0;
    await inviteMember(deps, w.ownerCtx, { email: guest.email, role: "editor" });
    const token = /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)?.text ?? "")?.[1] ?? "";
    expect((await acceptInvite(deps, guest, token)).ok).toBe(true);
    expect((await leaveHousehold(deps, ctxFor(guest, w.householdA, "editor"))).ok).toBe(true);
    expect((await transferOwnership(deps, w.ownerCtx, w.editor.id)).ok).toBe(true);

    const newOwner = ctxFor(w.editor, w.householdA, "owner");
    const names = (await createAuditRepository(db, newOwner).list(100)).map((entry) => entry.event);
    expect(names).toEqual(
      expect.arrayContaining(["invite_accepted", "member_left", "ownership_transferred"]),
    );
  });

  it("transfers ownership including households.created_by, demoting the old owner", async () => {
    const w = await world();
    expect((await transferOwnership(deps, w.ownerCtx, w.editor.id)).ok).toBe(true);
    const roles = await db.query.householdMembers.findMany({
      where: (m, { eq: equals }) => equals(m.householdId, w.householdA.id),
    });
    expect(roles.find((m) => m.userId === w.editor.id)?.role).toBe("owner");
    expect(roles.find((m) => m.userId === w.ownerA.id)?.role).toBe("editor");
    const household = await db.query.households.findFirst({
      where: (h, { eq: equals }) => equals(h.id, w.householdA.id),
    });
    expect(household?.createdBy).toBe(w.editor.id);
  });

  it("lets only owners manage roles, transfer or remove; owners cannot leave", async () => {
    const w = await world();
    for (const ctx of [w.editorCtx, w.viewerCtx]) {
      expect((await changeMemberRole(deps, ctx, w.viewer.id, "editor")).ok).toBe(false);
      expect((await transferOwnership(deps, ctx, ctx.userId)).ok).toBe(false);
      expect((await removeMember(deps, ctx, w.editor.id)).ok).toBe(false);
    }
    const leave = await leaveHousehold(deps, w.ownerCtx);
    expect(!leave.ok && leave.error.code).toBe("conflict");
    const stillMember = await db.query.householdMembers.findFirst({
      where: (m, { and, eq: equals }) =>
        and(equals(m.householdId, w.householdA.id), equals(m.userId, w.ownerA.id)),
    });
    expect(stillMember?.role).toBe("owner");
  });
});

describe("audit log access", () => {
  it("is readable by owners only, and never across households", async () => {
    const w = await world();
    await inviteMember(deps, w.ownerCtx, { email: "x@example.test", role: "viewer" });
    await inviteMember(deps, w.ownerBCtx, { email: "y@example.test", role: "viewer" });

    const ownerView = await listAuditLog({ db }, w.ownerCtx);
    expect(ownerView.ok && ownerView.value.entries.length).toBe(1);
    for (const ctx of [w.editorCtx, w.viewerCtx]) {
      expect((await listAuditLog({ db }, ctx)).ok).toBe(false);
      // The service check is not the only line of defense: the database hides rows from non-owners.
      expect(await createAuditRepository(db, ctx).list(10)).toEqual([]);
    }
    const other = await createAuditRepository(db, {
      householdId: w.householdB.id,
      userId: w.ownerA.id,
    }).list(10);
    expect(other).toEqual([]);
  });

  it("is append-only for the app role and rejects forged actors", async () => {
    const w = await world();
    await createAuditRepository(db, w.ownerCtx).record({
      event: "member_left",
      actorUserId: w.ownerA.id,
    });
    const scoped = scopeDb(db, w.ownerCtx);
    const updated = await scoped
      .update(auditLog)
      .set({ detail: "tampered" })
      .where(eq(auditLog.householdId, w.householdA.id))
      .returning({ id: auditLog.id });
    const deleted = await scoped
      .delete(auditLog)
      .where(eq(auditLog.householdId, w.householdA.id))
      .returning({ id: auditLog.id });
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);

    await expect(
      createAuditRepository(db, w.ownerCtx).record({
        event: "member_left",
        actorUserId: w.ownerB.id,
      }),
    ).rejects.toThrow();
    await expect(
      createAuditRepository(db, { householdId: w.householdB.id, userId: w.ownerA.id }).record({
        event: "member_left",
        actorUserId: w.ownerA.id,
      }),
    ).rejects.toThrow();
  });
});

describe("audit retention", () => {
  it("deletes only entries past the retention period and is idempotent", async () => {
    const w = await world();
    const now = new Date("2030-06-01T00:00:00Z");
    await db.insert(auditLog).values([
      {
        householdId: w.householdA.id,
        actorUserId: w.ownerA.id,
        event: "member_left",
        createdAt: new Date("2029-01-01T00:00:00Z"),
      },
      {
        householdId: w.householdA.id,
        actorUserId: w.ownerA.id,
        event: "member_left",
        createdAt: new Date("2030-05-30T00:00:00Z"),
      },
    ]);
    const first = await purgeAuditLog(db, { now, retentionDays: 365 });
    expect(first.deleted).toBeGreaterThanOrEqual(1);
    const remaining = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.householdId, w.householdA.id));
    expect(remaining.map((row) => row.createdAt.toISOString())).toEqual([
      "2030-05-30T00:00:00.000Z",
    ]);
    expect((await purgeAuditLog(db, { now, retentionDays: 365 })).deleted).toBe(0);
  });
});
