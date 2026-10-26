import "server-only";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import type { MedicationDeps } from "./service";

export function getMedicationDeps(): MedicationDeps {
  const env = getEnv();
  return {
    db: getDb(),
    staleWindowHours: env.REMINDER_STALE_WINDOW_HOURS,
    missedAfterHours: env.DOSE_MISSED_AFTER_HOURS,
  };
}
