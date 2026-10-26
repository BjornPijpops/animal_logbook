import "server-only";
import { getDb } from "@/db/client";
import type { DashboardDeps } from "./service";

export function getDashboardDeps(): DashboardDeps {
  return { db: getDb() };
}
