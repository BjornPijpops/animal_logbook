import { scopeDb } from "@/db/scope";
import { eq } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { notificationPreferences } from "@/db/schema";
import { CHANNELS, type ChannelName } from "./channels";

export type ChannelPreferences = Record<ChannelName, boolean>;

// Every channel is on until the user turns it off.
export function createPreferencesRepository(executor: DbExecutor, userId: string) {
  const db = scopeDb(executor, { userId });
  return {
    async get(): Promise<ChannelPreferences> {
      const rows = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId));
      const result: ChannelPreferences = { email: true, push: true };
      for (const row of rows) result[row.channel] = row.enabled;
      return result;
    },
    async set(channel: ChannelName, enabled: boolean): Promise<void> {
      if (!CHANNELS.includes(channel)) return;
      await db
        .insert(notificationPreferences)
        .values({ userId, channel, enabled })
        .onConflictDoUpdate({
          target: [notificationPreferences.userId, notificationPreferences.channel],
          set: { enabled, updatedAt: new Date() },
        });
    },
  };
}
