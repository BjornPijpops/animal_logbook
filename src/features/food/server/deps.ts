import "server-only";
import { getDb } from "@/db/client";
import type { FoodDeps } from "./service";

export function getFoodDeps(): FoodDeps {
  return { db: getDb() };
}
