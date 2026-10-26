import "server-only";
import { getDb } from "@/db/client";
import type { MedicalDeps } from "./service";

export function getMedicalDeps(): MedicalDeps {
  return { db: getDb() };
}
