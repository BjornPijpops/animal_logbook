import type { Database } from "@/db/client";
import { err, ok, type Result } from "@/lib/result";
import { preferenceSchema, pushSubscriptionSchema, unsubscribeSchema } from "../schemas";
import { isAllowedPushEndpoint, type ChannelName } from "./channels";
import { createPreferencesRepository, type ChannelPreferences } from "./preferences.repository";
import { createPushRepository } from "./push.repository";

export type NotificationDeps = {
  db: Database;
  pushConfigured: boolean;
  allowLocalPushEndpoints: boolean;
};

export const MAX_DEVICES_PER_USER = 20;

export type NotificationSettings = {
  preferences: ChannelPreferences;
  pushConfigured: boolean;
  endpoints: string[];
};

// These act on the signed-in user's own settings, never on household data, so every member
// (viewers included) may manage their own notifications.
export async function getNotificationSettings(
  deps: NotificationDeps,
  userId: string,
): Promise<NotificationSettings> {
  const subscriptions = await createPushRepository(deps.db, userId).list();
  return {
    preferences: await createPreferencesRepository(deps.db, userId).get(),
    pushConfigured: deps.pushConfigured,
    endpoints: subscriptions.map((subscription) => subscription.endpoint),
  };
}

export async function setChannelPreference(
  deps: NotificationDeps,
  userId: string,
  input: unknown,
): Promise<Result<{ channel: ChannelName; enabled: boolean }>> {
  const parsed = preferenceSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Invalid preference");
  await createPreferencesRepository(deps.db, userId).set(parsed.data.channel, parsed.data.enabled);
  return ok(parsed.data);
}

export async function subscribePush(
  deps: NotificationDeps,
  userId: string,
  input: unknown,
  userAgent: string | null,
): Promise<Result<true>> {
  if (!deps.pushConfigured) return err("validation", "Push is not configured");
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Invalid subscription");
  const { endpoint, keys } = parsed.data;
  if (!isAllowedPushEndpoint(endpoint, deps.allowLocalPushEndpoints)) {
    return err("validation", "Unsupported push endpoint");
  }
  const repo = createPushRepository(deps.db, userId);
  const existing = await repo.list();
  if (existing.length >= MAX_DEVICES_PER_USER && !existing.some((s) => s.endpoint === endpoint)) {
    return err("conflict", "Too many devices");
  }
  await repo.upsert({
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: userAgent?.slice(0, 200) ?? null,
  });
  return ok(true as const);
}

export async function unsubscribePush(
  deps: NotificationDeps,
  userId: string,
  input: unknown,
): Promise<Result<true>> {
  const parsed = unsubscribeSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Invalid subscription");
  const removed = await createPushRepository(deps.db, userId).removeByEndpoint(
    parsed.data.endpoint,
  );
  return removed ? ok(true as const) : err("not_found", "Subscription not found");
}
