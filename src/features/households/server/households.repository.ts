import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database, DbExecutor } from "@/db/client";
import { scopeDb, type Tenant } from "@/db/scope";
import { householdMembers, households, users } from "@/db/schema";
import type { Role } from "./can";

export type Membership = {
  householdId: string;
  householdName: string;
  timezone: string;
  role: Role;
};

// User-scoped (not household-scoped): this is how a request discovers which households it may act in.
export async function listMembershipsForUser(
  executor: DbExecutor,
  userId: string,
): Promise<Membership[]> {
  return scopeDb(executor, { userId })
    .select({
      householdId: households.id,
      householdName: households.name,
      timezone: households.timezone,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(and(eq(householdMembers.userId, userId), isNull(households.deletedAt)))
    .orderBy(asc(householdMembers.createdAt), asc(households.id));
}

// Serialised per user with a transaction-scoped advisory lock, so concurrent first requests
// create exactly one household. The membership re-check happens inside the lock.
export async function ensureHouseholdForUser(
  db: Database,
  input: { name: string; userId: string },
): Promise<void> {
  // The id is chosen up front so the transaction can carry it as its household context.
  const householdId = randomUUID();
  await scopeDb(db, { userId: input.userId, householdId }).transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`);
    const existing = await listMembershipsForUser(tx, input.userId);
    if (existing.length > 0) return;
    const [owner] = await tx
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, input.userId));
    const [household] = await tx
      .insert(households)
      .values({
        id: householdId,
        name: input.name,
        createdBy: input.userId,
        timezone: owner?.timezone ?? "UTC",
      })
      .returning({ id: households.id });
    if (!household) throw new Error("household insert returned no row");
    await tx.insert(householdMembers).values({ householdId, userId: input.userId, role: "owner" });
  });
}

export async function setHouseholdTimezone(
  executor: DbExecutor,
  tenant: Tenant,
  timezone: string,
): Promise<void> {
  const db = scopeDb(executor, tenant);
  await db.update(households).set({ timezone }).where(eq(households.id, tenant.householdId));
}
