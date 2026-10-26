import { scopeDb, type Tenant } from "@/db/scope";
import { and, asc, eq, ne } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { householdMembers, users } from "@/db/schema";
import type { Role } from "./can";

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  joinedAt: Date;
};

export function createMembersRepository(executor: DbExecutor, tenant: Tenant) {
  const db = scopeDb(executor, tenant);
  const { householdId } = tenant;
  return {
    async list(): Promise<MemberRow[]> {
      return db
        .select({
          userId: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: householdMembers.role,
          joinedAt: householdMembers.createdAt,
        })
        .from(householdMembers)
        .innerJoin(users, eq(users.id, householdMembers.userId))
        .where(eq(householdMembers.householdId, householdId))
        .orderBy(asc(householdMembers.createdAt), asc(users.id));
    },

    async findRole(userId: string): Promise<Role | null> {
      const [row] = await db
        .select({ role: householdMembers.role })
        .from(householdMembers)
        .where(
          and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)),
        );
      return row?.role ?? null;
    },

    async add(userId: string, role: Role): Promise<void> {
      await db.insert(householdMembers).values({ householdId, userId, role });
    },

    // The owner can never be removed this way.
    async remove(userId: string): Promise<boolean> {
      const rows = await db
        .delete(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, householdId),
            eq(householdMembers.userId, userId),
            ne(householdMembers.role, "owner"),
          ),
        )
        .returning({ id: householdMembers.id });
      return rows.length > 0;
    },
  };
}
