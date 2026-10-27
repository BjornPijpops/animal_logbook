import type { Dashboard } from "../server/service";

const D = (iso: string) => new Date(iso);

export function makeDashboard(over: Partial<Dashboard> = {}): Dashboard {
  return {
    today: "2025-06-10",
    animalId: null,
    appointments: { items: [], more: false },
    followUps: { items: [], more: false },
    overdueVaccinations: { items: [], more: false },
    medications: { dueToday: [], dueMore: false, missed: [], ending: [] },
    documents: { items: [], more: false },
    spending: { year: 2025, month: 6, totals: [] },
    dietChanges: { items: [], more: false },
    comingUp: { items: [], more: false },
    ...over,
  };
}

export const dose = (
  scheduledAt: string,
  over: Partial<Dashboard["medications"]["dueToday"][number]> = {},
) => ({
  medicationId: "00000000-0000-4000-8000-000000000001",
  name: "Amoxicillin",
  dosage: "1 tablet",
  animalId: "a1",
  animalName: "Rex",
  scheduledAt: D(scheduledAt),
  late: false,
  ...over,
});
