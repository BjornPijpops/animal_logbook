import type { Database } from "@/db/client";
import type { AppointmentInput } from "../schemas";
import type { AppointmentDeps } from "../server/service";

export function makeAppointmentDeps(db: Database, now?: () => Date): AppointmentDeps {
  return now ? { db, now } : { db };
}

export function appointmentInput(
  animalId: string,
  overrides: Partial<AppointmentInput> = {},
): AppointmentInput {
  return {
    animalId,
    type: "vet",
    title: "Annual check-up",
    date: "2025-03-14",
    time: "10:30",
    cost: "45.50",
    currency: "EUR",
    notes: "",
    followUpDate: "2025-04-14",
    vaccinationRecord: "",
    ...overrides,
  };
}
