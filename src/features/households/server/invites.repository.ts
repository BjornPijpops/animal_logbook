import { scopeDb, type Tenant } from "@/db/scope";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { householdInvites } from "@/db/schema";
import type { Role } from "./can";

export type InviteRow = {
  id: string;
  householdId: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
};

export type NewInvite = {
  email: string;
  role: Exclude<Role, "owner">;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
};

const columns = {
  id: householdInvites.id,
  householdId: householdInvites.householdId,
  email: householdInvites.email,
  role: householdInvites.role,
  expiresAt: householdInvites.expiresAt,
  createdAt: householdInvites.createdAt,
};

const open = and(isNull(householdInvites.acceptedAt), isNull(householdInvites.revokedAt));

export function createInvitesRepository(executor: DbExecutor, tenant: Tenant) {
  const db = scopeDb(executor, tenant);
  const { householdId } = tenant;
  const inHousehold = eq(householdInvites.householdId, householdId);

  return {
    async create(invite: NewInvite): Promise<InviteRow> {
      const [row] = await db
        .insert(householdInvites)
        .values({ ...invite, email: invite.email.toLowerCase(), householdId })
        .returning(columns);
      if (!row) throw new Error("invite insert returned no row");
      return row;
    },

    async listPending(now: Date): Promise<InviteRow[]> {
      return db
        .select(columns)
        .from(householdInvites)
        .where(and(inHousehold, open, gt(householdInvites.expiresAt, now)))
        .orderBy(asc(householdInvites.createdAt), asc(householdInvites.id));
    },

    async findOpenByEmail(email: string): Promise<InviteRow | null> {
      const [row] = await db
        .select(columns)
        .from(householdInvites)
        .where(
          and(inHousehold, open, sql`lower(${householdInvites.email}) = ${email.toLowerCase()}`),
        );
      return row ?? null;
    },

    async revoke(inviteId: string, now: Date): Promise<boolean> {
      const rows = await db
        .update(householdInvites)
        .set({ revokedAt: now })
        .where(and(inHousehold, open, eq(householdInvites.id, inviteId)))
        .returning({ id: householdInvites.id });
      return rows.length > 0;
    },

    async markAccepted(inviteId: string, now: Date): Promise<boolean> {
      const rows = await db
        .update(householdInvites)
        .set({ acceptedAt: now })
        .where(and(inHousehold, open, eq(householdInvites.id, inviteId)))
        .returning({ id: householdInvites.id });
      return rows.length > 0;
    },
  };
}

// The one deliberately unscoped lookup: the secret token is the capability that identifies the
// household. Callers must continue with the returned invite's own `householdId`.
export async function findOpenInviteByTokenHash(
  executor: DbExecutor,
  tokenHash: string,
  now: Date,
  userId: string,
): Promise<InviteRow | null> {
  // The one deliberately household-less lookup: the bearer of a valid token may see exactly that invite.
  const db = scopeDb(executor, { userId, inviteTokenHash: tokenHash });
  const [row] = await db
    .select(columns)
    .from(householdInvites)
    .where(
      and(eq(householdInvites.tokenHash, tokenHash), open, gt(householdInvites.expiresAt, now)),
    );
  return row ?? null;
}
