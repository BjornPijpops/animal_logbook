import type { Database } from "@/db/client";
import {
  createEmailChannel,
  createPushChannel,
  createPushStore,
  createWebPushSender,
} from "@/features/notifications/worker";
import type { Env } from "@/lib/env";
import { smtpMailer } from "@/lib/notify/email";
import type { ReminderJobDeps } from "./jobs/reminders";

export function buildReminderDeps(db: Database, env: Env): ReminderJobDeps {
  const sender = createWebPushSender(env);
  return {
    db,
    staleWindowHours: env.REMINDER_STALE_WINDOW_HOURS,
    missedAfterHours: env.DOSE_MISSED_AFTER_HOURS,
    delivery: {
      db,
      appUrl: env.APP_URL,
      staleWindowHours: env.REMINDER_STALE_WINDOW_HOURS,
      channels: {
        email: createEmailChannel(smtpMailer),
        ...(sender
          ? {
              push: createPushChannel(createPushStore(db), sender, {
                allowLocalEndpoints: env.ALLOW_LOCAL_PUSH_ENDPOINTS,
              }),
            }
          : {}),
      },
    },
  };
}
