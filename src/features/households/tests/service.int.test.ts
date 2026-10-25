import { describe, expect, it } from "vitest";
import { householdMembers } from "@/db/schema";
import { createPostgresRateLimiter } from "@/lib/security/rate-limit";
import {
  addMember,
  createFakeMailer,
  createUser,
  seedTwoHouseholds,
  setupTestDatabase,
} from "@/test/db";
import { eq } from "drizzle-orm";
import { resolveCtx, type Ctx } from "../server/context";
import { acceptInvite, inviteMember, listMembers, removeMember } from "../server/service";

const db = setupTestDatabase();

function makeDeps(now = () => new Date()) {
  const mailer = createFakeMailer();
  return {
    mailer,
    deps: { db, mailer, limiter: createPostgresRateLimiter(db), appUrl: "http://test", now },
  };
}

const ownerCtx = (w: Awaited<ReturnType<typeof seedTwoHouseholds>>): Ctx => ({
  userId: w.ownerA.id,
  householdId: w.householdA.id,
  householdName: w.householdA.name,
  role: "owner",
});

function tokenFrom(text: string): string {
  const match = /\/invite\/([\w-]+)/.exec(text);
  if (!match?.[1]) throw new Error("no invite link in email");
  return match[1];
}

describe("resolveCtx", () => {
  it("creates a personal owner household for a user that has none", async () => {
    const user = await createUser(db, { name: "Fresh" });
    const result = await resolveCtx(db, { id: user.id, name: "Fresh" });
    expect(result.ok && result.value.role).toBe("owner");
    const again = await resolveCtx(db, { id: user.id, name: "Fresh" });
    expect(again.ok && result.ok && again.value.householdId).toBe(
      result.ok && result.value.householdId,
    );
  });
});

describe("invitations", () => {
  it("lets the owner invite, the invitee accept, and shares access", async () => {
    const w = await seedTwoHouseholds(db);
    const { deps, mailer } = makeDeps();
    const guest = await createUser(db, { email: "guest@example.test" });

    const invited = await inviteMember(deps, ownerCtx(w), {
      email: "Guest@Example.test ",
      role: "editor",
    });
    expect(invited.ok).toBe(true);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("guest@example.test");

    const accepted = await acceptInvite(deps, guest, tokenFrom(mailer.sent[0]?.text ?? ""));
    expect(accepted).toEqual({ ok: true, value: { householdId: w.householdA.id } });

    const members = await listMembers(deps, ownerCtx(w));
    expect(members.ok && members.value.map((m) => m.role).sort()).toEqual(["editor", "owner"]);

    const reuse = await acceptInvite(deps, guest, tokenFrom(mailer.sent[0]?.text ?? ""));
    expect(reuse.ok).toBe(false);
  });

  it("rejects accepting with a different or unverified email", async () => {
    const w = await seedTwoHouseholds(db);
    const { deps, mailer } = makeDeps();
    await inviteMember(deps, ownerCtx(w), { email: "right@example.test", role: "viewer" });
    const token = tokenFrom(mailer.sent[0]?.text ?? "");

    const wrong = await createUser(db, { email: "wrong@example.test" });
    expect(await acceptInvite(deps, wrong, token)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "forbidden" }),
    });

    const unverified = await createUser(db, { email: "right@example.test", emailVerified: false });
    expect((await acceptInvite(deps, unverified, token)).ok).toBe(false);
  });

  it("rejects expired invitations", async () => {
    const w = await seedTwoHouseholds(db);
    const start = new Date("2026-01-01T00:00:00Z");
    const { deps, mailer } = makeDeps(() => start);
    await inviteMember(deps, ownerCtx(w), { email: "late@example.test", role: "viewer" });
    const late = await createUser(db, { email: "late@example.test" });
    const eightDaysLater = { ...deps, now: () => new Date(start.getTime() + 8 * 86_400_000) };
    const result = await acceptInvite(eightDaysLater, late, tokenFrom(mailer.sent[0]?.text ?? ""));
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "not_found" }) });
  });

  it("rejects duplicate pending invites and existing members", async () => {
    const w = await seedTwoHouseholds(db);
    const { deps } = makeDeps();
    expect(
      (await inviteMember(deps, ownerCtx(w), { email: "dup@example.test", role: "viewer" })).ok,
    ).toBe(true);
    expect(
      await inviteMember(deps, ownerCtx(w), { email: "dup@example.test", role: "viewer" }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "conflict" }),
    });
    const own = await inviteMember(deps, ownerCtx(w), { email: w.ownerA.email, role: "viewer" });
    expect(own.ok).toBe(false);
  });

  it("validates input and rate limits invitations", async () => {
    const w = await seedTwoHouseholds(db);
    const { deps } = makeDeps();
    expect(await inviteMember(deps, ownerCtx(w), { email: "nope", role: "viewer" })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation" }),
    });
    expect(
      await inviteMember(deps, ownerCtx(w), { email: "x@example.test", role: "owner" }),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation" }),
    });
    let last: Awaited<ReturnType<typeof inviteMember>> | undefined;
    for (let i = 0; i < 21; i++) {
      last = await inviteMember(deps, ownerCtx(w), {
        email: `bulk${i}@example.test`,
        role: "viewer",
      });
    }
    expect(last).toEqual({ ok: false, error: expect.objectContaining({ code: "rate_limited" }) });
  });
});

describe("roles", () => {
  it("only owners manage members; editors and viewers are forbidden", async () => {
    const w = await seedTwoHouseholds(db);
    const { deps } = makeDeps();
    const editor = await createUser(db);
    const viewer = await createUser(db);
    await addMember(db, w.householdA.id, editor.id, "editor");
    await addMember(db, w.householdA.id, viewer.id, "viewer");

    for (const [user, role] of [
      [editor, "editor"],
      [viewer, "viewer"],
    ] as const) {
      const ctx: Ctx = { userId: user.id, householdId: w.householdA.id, householdName: "A", role };
      expect(await inviteMember(deps, ctx, { email: "z@example.test", role: "viewer" })).toEqual({
        ok: false,
        error: expect.objectContaining({ code: "forbidden" }),
      });
      expect(await removeMember(deps, ctx, w.ownerA.id)).toEqual({
        ok: false,
        error: expect.objectContaining({ code: "forbidden" }),
      });
    }
  });

  it("owner can remove a member but the owner row is protected", async () => {
    const w = await seedTwoHouseholds(db);
    const { deps } = makeDeps();
    const editor = await createUser(db);
    await addMember(db, w.householdA.id, editor.id, "editor");

    expect((await removeMember(deps, ownerCtx(w), editor.id)).ok).toBe(true);
    expect((await removeMember(deps, ownerCtx(w), w.ownerA.id)).ok).toBe(false);
    const rows = await db
      .select()
      .from(householdMembers)
      .where(eq(householdMembers.householdId, w.householdA.id));
    expect(rows.map((r) => r.role)).toEqual(["owner"]);
  });

  it("the database allows only one owner per household", async () => {
    const w = await seedTwoHouseholds(db);
    const other = await createUser(db);
    await expect(addMember(db, w.householdA.id, other.id, "owner")).rejects.toThrow();
  });
});
