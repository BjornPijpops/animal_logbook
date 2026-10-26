import "server-only";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { createPostgresRateLimiter } from "@/lib/security/rate-limit";
import { getExportStorage, getStorage } from "@/lib/storage";
import type { PrivacyDeps } from "./service";

export function getPrivacyDeps(): PrivacyDeps {
  const db = getDb();
  return {
    db,
    limiter: createPostgresRateLimiter(db),
    fileStorage: getStorage(),
    exportStorage: getExportStorage(),
    exportTtlHours: getEnv().EXPORT_TTL_HOURS,
    exportMaxBytes: getEnv().EXPORT_MAX_MB * 1024 * 1024,
  };
}
