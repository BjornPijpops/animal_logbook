import "server-only";
import { getDb } from "@/db/client";
import type { ExpenseDeps } from "./service";

export function getExpenseDeps(): ExpenseDeps {
  return { db: getDb() };
}
