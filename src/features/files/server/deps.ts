import "server-only";
import { getDb } from "@/db/client";
import { getStorage } from "@/lib/storage";
import type { FileDeps } from "./service";

export function getFileDeps(): FileDeps {
  return { db: getDb(), storage: getStorage() };
}
