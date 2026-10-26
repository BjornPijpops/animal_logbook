import "server-only";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import type { NotificationDeps } from "./service";

export function getNotificationDeps(): NotificationDeps {
  const env = getEnv();
  return {
    db: getDb(),
    pushConfigured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
    allowLocalPushEndpoints: env.ALLOW_LOCAL_PUSH_ENDPOINTS,
  };
}

export const getVapidPublicKey = () => getEnv().VAPID_PUBLIC_KEY ?? null;
