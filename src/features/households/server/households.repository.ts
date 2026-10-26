import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database, DbExecutor } from "@/db/client";
import { householdMembers, households } from "@/db/schema";
import type { Role } from "./can";

export type Membership = { householdId: string; householdName: string; role: Role };

// User-scoped (not household-scoped): this is how a request discovers which households it may act in.
export async function listMembershipsForUser(
  db: DbExecutor,
  userId: string,
): Promise<Membership[]> {
  return db
    .select({
      householdId: households.id,
      householdName: households.name,
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
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`);
    const existing = await listMembershipsForUser(tx, input.userId);
    if (existing.length > 0) return;
    const [household] = await tx
      .insert(households)
      .values({ name: input.name, createdBy: input.userId })
      .returning({ id: households.id });
    if (!household) throw new Error("household insert returned no row");
    await tx
      .insert(householdMembers)
      .values({ householdId: household.id, userId: input.userId, role: "owner" });
  });
}
