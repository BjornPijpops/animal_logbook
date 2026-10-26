import type { Database } from "@/db/client";
import type { MedicalRecordInput } from "../schemas";
import type { MedicalDeps } from "../server/service";

export function makeMedicalDeps(db: Database, now?: () => Date): MedicalDeps {
  return now ? { db, now } : { db };
}

export function recordInput(
  animalId: string,
  overrides: Partial<MedicalRecordInput> = {},
): MedicalRecordInput {
  return {
    animalId,
    type: "vaccination",
    title: "Rabies",
    startedOn: "2024-02-29",
    endedOn: "",
    severity: "",
    nextDueOn: "2025-02-28",
    notes: "",
    ...overrides,
  };
}
