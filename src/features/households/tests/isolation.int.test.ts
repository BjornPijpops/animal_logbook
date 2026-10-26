import { describe, expect, it } from "vitest";
import { createFakeMailer, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { createPostgresRateLimiter } from "@/lib/security/rate-limit";
import { resolveCtx, type Ctx } from "../server/context";
import { createInvitesRepository } from "../server/invites.repository";
import { createMembersRepository } from "../server/members.repository";
import {
  inviteMember,
  listMembers,
  listPendingInvites,
  removeMember,
  revokeInvite,
} from "../server/service";

const db = setupTestDatabase();
const deps = () => ({
  db,
  mailer: createFakeMailer(),
  limiter: createPostgresRateLimiter(db),
  appUrl: "http://test",
});

async function setup() {
  const world = await seedTwoHouseholds(db);
  const invitesB = createInvitesRepository(db, world.householdB.id);
  const inviteB = await invitesB.create({
    email: "guest-b@example.test",
    role: "viewer",
    tokenHash: `hash-${world.householdB.id}`,
    invitedBy: world.ownerB.id,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  const ctxA: Ctx = {
    userId: world.ownerA.id,
    householdId: world.householdA.id,
    householdName: world.householdA.name,
    timezone: "UTC",
    role: "owner",
  };
  return { ...world, inviteB, ctxA };
}

describe("tenant isolation: repositories", () => {
  it("members.list only returns the household's own members", async () => {
    const w = await setup();
    const a = await createMembersRepository(db, w.householdA.id).list();
    expect(a.map((m) => m.userId)).toEqual([w.ownerA.id]);
  });

  it("members.findRole and members.remove cannot reach another household's member", async () => {
    const w = await setup();
    const repoA = createMembersRepository(db, w.householdA.id);
    expect(await repoA.findRole(w.ownerB.id)).toBeNull();
    expect(await repoA.remove(w.ownerB.id)).toBe(false);
    expect(await createMembersRepository(db, w.householdB.id).findRole(w.ownerB.id)).toBe("owner");
  });

  it("invites.listPending never shows another household's invites", async () => {
    const w = await setup();
    const listA = await createInvitesRepository(db, w.householdA.id).listPending(new Date());
    expect(listA).toEqual([]);
    const listB = await createInvitesRepository(db, w.householdB.id).listPending(new Date());
    expect(listB.map((i) => i.id)).toEqual([w.inviteB.id]);
  });

  it("invites.revoke and invites.markAccepted cannot touch another household's invite", async () => {
    const w = await setup();
    const repoA = createInvitesRepository(db, w.householdA.id);
    expect(await repoA.revoke(w.inviteB.id, new Date())).toBe(false);
    expect(await repoA.markAccepted(w.inviteB.id, new Date())).toBe(false);
    expect(await repoA.findOpenByEmail("guest-b@example.test")).toBeNull();
    expect(await createInvitesRepository(db, w.householdB.id).listPending(new Date())).toHaveLength(
      1,
    );
  });
});

describe("tenant isolation: services and context", () => {
  it("revokeInvite and removeMember report other households' ids as not found", async () => {
    const w = await setup();
    const revoke = await revokeInvite(deps(), w.ctxA, w.inviteB.id);
    expect(revoke).toEqual({ ok: false, error: expect.objectContaining({ code: "not_found" }) });
    const remove = await removeMember(deps(), w.ctxA, w.ownerB.id);
    expect(remove).toEqual({ ok: false, error: expect.objectContaining({ code: "not_found" }) });
  });

  it("inviting to household A never creates data in household B", async () => {
    const w = await setup();
    const result = await inviteMember(deps(), w.ctxA, {
      email: "new@example.test",
      role: "viewer",
    });
    expect(result.ok).toBe(true);
    const pendingB = await listPendingInvites(deps(), { ...w.ctxA, householdId: w.householdB.id });
    expect(pendingB.ok && pendingB.value.map((i) => i.email)).toEqual(["guest-b@example.test"]);
    const membersB = await listMembers(deps(), { ...w.ctxA, householdId: w.householdB.id });
    expect(membersB.ok && membersB.value).toHaveLength(1);
  });

  it("resolveCtx refuses a household the user does not belong to", async () => {
    const w = await setup();
    const result = await resolveCtx(db, { id: w.ownerA.id, name: "Owner A" }, w.householdB.id);
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "not_found" }) });
    const own = await resolveCtx(db, { id: w.ownerA.id, name: "Owner A" }, w.householdA.id);
    expect(own.ok && own.value.householdId).toBe(w.householdA.id);
  });
});
