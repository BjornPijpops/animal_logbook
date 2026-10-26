import "server-only";
import { getDb } from "@/db/client";
import type { AppointmentDeps } from "./service";

export function getAppointmentDeps(): AppointmentDeps {
  return { db: getDb() };
}
