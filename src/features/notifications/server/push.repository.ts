import { scopeDb } from "@/db/scope";
import { and, eq } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import type { PushStore, PushSubscriptionRecord } from "./channels";

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

// Scoped by user, never by household: a subscription is one person's device, so no query here can
// return another member's subscription.
export function createPushRepository(executor: DbExecutor, userId: string) {
  const db = scopeDb(executor, { userId });
  const mine = eq(pushSubscriptions.userId, userId);
  return {
    async upsert(input: PushSubscriptionInput): Promise<void> {
      await db
        .insert(pushSubscriptions)
        .values({ ...input, userId })
        .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { ...input, userId } });
    },

    async list(): Promise<PushSubscriptionRecord[]> {
      return db
        .select({
          id: pushSubscriptions.id,
          endpoint: pushSubscriptions.endpoint,
          p256dh: pushSubscriptions.p256dh,
          auth: pushSubscriptions.auth,
        })
        .from(pushSubscriptions)
        .where(mine);
    },

    async removeByEndpoint(endpoint: string): Promise<boolean> {
      const rows = await db
        .delete(pushSubscriptions)
        .where(and(mine, eq(pushSubscriptions.endpoint, endpoint)))
        .returning({ id: pushSubscriptions.id });
      return rows.length > 0;
    },
  };
}

// What the push channel needs at delivery time: the recipient's own subscriptions only.
export function createPushStore(db: DbExecutor): PushStore {
  return {
    list: (userId) => createPushRepository(db, userId).list(),
    remove: async (id) => {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
    },
  };
}
