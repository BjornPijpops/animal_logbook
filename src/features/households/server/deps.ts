import "server-only";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { smtpMailer } from "@/lib/notify/email";
import { createPostgresRateLimiter } from "@/lib/security/rate-limit";
import type { HouseholdDeps } from "./service";

export function getHouseholdDeps(): HouseholdDeps {
  const db = getDb();
  return {
    db,
    mailer: smtpMailer,
    limiter: createPostgresRateLimiter(db),
    appUrl: getEnv().APP_URL,
  };
}
