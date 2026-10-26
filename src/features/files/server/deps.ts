import "server-only";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { getStorage } from "@/lib/storage";
import { getVirusScanner } from "@/lib/uploads";
import type { FileDeps } from "./service";
import type { UploadDeps } from "./uploads";

export function getFileDeps(): FileDeps {
  return { db: getDb(), storage: getStorage() };
}

export function getUploadDeps(): UploadDeps {
  const env = getEnv();
  return {
    db: getDb(),
    storage: getStorage(),
    scanner: getVirusScanner(),
    maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
    householdQuotaBytes: env.HOUSEHOLD_QUOTA_MB * 1024 * 1024,
  };
}
