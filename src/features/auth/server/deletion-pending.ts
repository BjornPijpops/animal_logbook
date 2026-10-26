import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { users } from "@/db/schema";

// An account that asked for deletion is locked from that moment, even while rows are still being
// removed. Sign-in (session creation) and session lookup both consult this.
export async function isDeletionPending(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), isNotNull(users.deletionRequestedAt)));
  return Boolean(row);
}
