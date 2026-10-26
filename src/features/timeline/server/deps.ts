import "server-only";
import { getDb } from "@/db/client";
import type { TimelineDeps } from "./service";

export function getTimelineDeps(): TimelineDeps {
  return { db: getDb() };
}
