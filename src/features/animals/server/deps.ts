import "server-only";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { getStorage } from "@/lib/storage";
import type { AnimalDeps } from "./service";

export function getAnimalDeps(): AnimalDeps {
  return {
    db: getDb(),
    storage: getStorage(),
    maxUploadBytes: getEnv().MAX_UPLOAD_MB * 1024 * 1024,
  };
}
