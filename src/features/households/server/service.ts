import type { Database } from "@/db/client";
import { TransactionRollbackError } from "drizzle-orm";
import { scopeDb } from "@/db/scope";
import type { Mailer } from "@/lib/notify/email";
import { err, ok, type Result } from "@/lib/result";
import type { RateLimiter } from "@/lib/security/rate-limit";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { inviteMemberSchema, memberRoleSchema, timezoneSchema, uuidSchema } from "../schemas";
import { can } from "./can";
import type { Ctx } from "./context";
import {
  findOpenInviteByTokenHash,
  createInvitesRepository,
  type InviteRow,
} from "./invites.repository";
import { setHouseholdCreator, setHouseholdTimezone } from "./households.repository";
import { createAuditRepository } from "@/features/audit";
import { createMembersRepository, type MemberRow } from "./members.repository";

export type HouseholdDeps = {
  db: Database;
  mailer: Mailer;
  limiter: RateLimiter;
  appUrl: string;
  now?: () => Date;
};

const INVITE_TTL_DAYS = 7;
const INVITES_PER_HOUR = 20;

export async function listMembers(deps: HouseholdDeps, ctx: Ctx): Promise<Result<MemberRow[]>> {
  if (!can(ctx.role, "data:read")) return err("forbidden", "Not allowed");
  return ok(await createMembersRepository(deps.db, ctx).list());
}

export async function listPendingInvites(
  deps: HouseholdDeps,
  ctx: Ctx,
): Promise<Result<InviteRow[]>> {
  if (!can(ctx.role, "members:manage")) return err("forbidden", "Not allowed");
  const now = (deps.now ?? (() => new Date()))();
  return ok(await createInvitesRepository(deps.db, ctx).listPending(now));
}

export async function inviteMember(
  deps: HouseholdDeps,
  ctx: Ctx,
  rawInput: unknown,
): Promise<Result<InviteRow>> {
  if (!can(ctx.role, "members:manage")) return err("forbidden", "Not allowed");
  const parsed = inviteMemberSchema.safeParse(rawInput);
  if (!parsed.success) return err("validation", "Invalid invite");
  const { email, role } = parsed.data;

  const limit = await deps.limiter.consume(`invite:${ctx.userId}`, INVITES_PER_HOUR, 3600);
  if (!limit.allowed) return err("rate_limited", "Too many invitations, try again later");

  const members = createMembersRepository(deps.db, ctx);
  if ((await members.list()).some((m) => m.email.toLowerCase() === email)) {
    return err("conflict", "This person is already a member");
  }

  const invites = createInvitesRepository(deps.db, ctx);
  if (await invites.findOpenByEmail(email)) {
    return err("conflict", "An invitation is already pending for this email");
  }

  const now = (deps.now ?? (() => new Date()))();
  const { token, hash } = generateToken();
  const invite = await scopeDb(deps.db, ctx).transaction(async (tx) => {
    const created = await createInvitesRepository(tx, ctx).create({
      email,
      role,
      tokenHash: hash,
      invitedBy: ctx.userId,
      expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000),
    });
    await createAuditRepository(tx, ctx).record({
      event: "invite_sent",
      actorUserId: ctx.userId,
      detail: role,
    });
    return created;
  });

  await deps.mailer.send({
    to: email,
    subject: `You have been invited to ${ctx.householdName} on Animal Logbook`,
    text: [
      `You have been invited to join "${ctx.householdName}" as ${role}.`,
      `Sign in (or create an account) with this email address, then open:`,
      `${deps.appUrl}/invite/${token}`,
      `The link expires in ${INVITE_TTL_DAYS} days.`,
    ].join("\n\n"),
  });

  return ok(invite);
}

export async function revokeInvite(
  deps: HouseholdDeps,
  ctx: Ctx,
  inviteId: unknown,
): Promise<Result<null>> {
  if (!can(ctx.role, "members:manage")) return err("forbidden", "Not allowed");
  const id = uuidSchema.safeParse(inviteId);
  if (!id.success) return err("validation", "Invalid invite");
  const now = (deps.now ?? (() => new Date()))();
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const revoked = await createInvitesRepository(tx, ctx).revoke(id.data, now);
    if (!revoked) return err("not_found", "Invitation not found");
    await createAuditRepository(tx, ctx).record({
      event: "invite_revoked",
      actorUserId: ctx.userId,
    });
    return ok(null);
  });
}

export async function removeMember(
  deps: HouseholdDeps,
  ctx: Ctx,
  userId: unknown,
): Promise<Result<null>> {
  if (!can(ctx.role, "members:manage")) return err("forbidden", "Not allowed");
  const id = uuidSchema.safeParse(userId);
  if (!id.success) return err("validation", "Invalid member");
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const removed = await createMembersRepository(tx, ctx).remove(id.data);
    if (!removed) return err("not_found", "Member not found");
    await createAuditRepository(tx, ctx).record({
      event: "member_removed",
      actorUserId: ctx.userId,
      targetUserId: id.data,
    });
    return ok(null);
  });
}

export async function changeMemberRole(
  deps: HouseholdDeps,
  ctx: Ctx,
  userId: unknown,
  role: unknown,
): Promise<Result<null>> {
  if (!can(ctx.role, "members:manage")) return err("forbidden", "Not allowed");
  const id = uuidSchema.safeParse(userId);
  const next = memberRoleSchema.safeParse(role);
  if (!id.success || !next.success) return err("validation", "Invalid role change");
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const changed = await createMembersRepository(tx, ctx).setRole(id.data, next.data);
    if (!changed) return err("not_found", "Member not found");
    await createAuditRepository(tx, ctx).record({
      event: "role_changed",
      actorUserId: ctx.userId,
      targetUserId: id.data,
      detail: next.data,
    });
    return ok(null);
  });
}

// The new owner must already be a member. The old owner stays on as an editor.
export async function transferOwnership(
  deps: HouseholdDeps,
  ctx: Ctx,
  userId: unknown,
): Promise<Result<null>> {
  if (!can(ctx.role, "members:manage")) return err("forbidden", "Not allowed");
  const id = uuidSchema.safeParse(userId);
  if (!id.success) return err("validation", "Invalid member");
  if (id.data === ctx.userId) return err("validation", "You already own this household");
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const members = createMembersRepository(tx, ctx);
    if (!(await members.findRole(id.data))) return err("not_found", "Member not found");
    await members.demoteOwner(ctx.userId);
    await members.promoteToOwner(id.data);
    await setHouseholdCreator(tx, ctx, id.data);
    await createAuditRepository(tx, ctx).record({
      event: "ownership_transferred",
      actorUserId: ctx.userId,
      targetUserId: id.data,
    });
    return ok(null);
  });
}

// Owners cannot leave: they transfer ownership or delete the household first.
export async function leaveHousehold(deps: HouseholdDeps, ctx: Ctx): Promise<Result<null>> {
  if (ctx.role === "owner") return err("conflict", "Transfer ownership before leaving");
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    await createAuditRepository(tx, ctx).record({ event: "member_left", actorUserId: ctx.userId });
    const left = await createMembersRepository(tx, ctx).remove(ctx.userId);
    if (!left) tx.rollback();
    return ok(null);
  });
}

// The invite must have been sent to the accepting account's verified email address.
export async function acceptInvite(
  deps: HouseholdDeps,
  user: { id: string; email: string; emailVerified: boolean },
  token: string,
): Promise<Result<{ householdId: string }>> {
  const now = (deps.now ?? (() => new Date()))();
  const tokenHash = hashToken(token);
  const invite = await findOpenInviteByTokenHash(deps.db, tokenHash, now, user.id);
  if (!invite) return err("not_found", "This invitation is invalid or has expired");
  if (!user.emailVerified || invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return err("forbidden", "This invitation was sent to a different email address");
  }

  const scoped = scopeDb(deps.db, {
    userId: user.id,
    householdId: invite.householdId,
    inviteTokenHash: tokenHash,
  });
  return scoped
    .transaction(async (tx) => {
      const tenant = { householdId: invite.householdId, userId: user.id };
      const members = createMembersRepository(tx, tenant);
      if (await members.findRole(user.id)) return err("conflict", "You are already a member");
      // The membership policy accepts an invite that is still open, so the member is added first;
      // a lost claim race rolls the insert back.
      await members.add(user.id, invite.role);
      const claimed = await createInvitesRepository(tx, tenant).markAccepted(invite.id, now);
      if (!claimed) tx.rollback();
      await createAuditRepository(tx, tenant).record({
        event: "invite_accepted",
        actorUserId: user.id,
        targetUserId: user.id,
        detail: invite.role,
      });
      return ok({ householdId: invite.householdId });
    })
    .catch((error: unknown) => {
      if (error instanceof TransactionRollbackError) {
        return err("not_found", "This invitation is invalid or has expired");
      }
      throw error;
    });
}

export async function updateHouseholdTimezone(
  deps: Pick<HouseholdDeps, "db">,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ timezone: string }>> {
  if (!can(ctx.role, "members:manage")) return err("forbidden", "Not allowed");
  const parsed = timezoneSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Unknown time zone");
  await setHouseholdTimezone(deps.db, ctx, parsed.data);
  return ok({ timezone: parsed.data });
}
