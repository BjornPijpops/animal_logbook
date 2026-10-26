import type { Database } from "@/db/client";
import { err, ok, type Result } from "@/lib/result";
import type { Role } from "./can";
import { ensureHouseholdForUser, listMembershipsForUser } from "./households.repository";

export type Ctx = { userId: string; householdId: string; householdName: string; role: Role };

// Establishes the household a user acts in. Ids of households the user does not belong to
// are reported as "not found", never "forbidden", so they cannot be probed.
export async function resolveCtx(
  db: Database,
  user: { id: string; name: string },
  requestedHouseholdId?: string,
): Promise<Result<Ctx>> {
  let memberships = await listMembershipsForUser(db, user.id);

  if (memberships.length === 0) {
    await ensureHouseholdForUser(db, { name: defaultHouseholdName(user.name), userId: user.id });
    memberships = await listMembershipsForUser(db, user.id);
  }

  const membership = requestedHouseholdId
    ? memberships.find((m) => m.householdId === requestedHouseholdId)
    : memberships[0];
  if (!membership) return err("not_found", "Household not found");

  return ok({
    userId: user.id,
    householdId: membership.householdId,
    householdName: membership.householdName,
    role: membership.role,
  });
}

export function defaultHouseholdName(userName: string): string {
  return `${userName.trim() || "My"}'s household`;
}
