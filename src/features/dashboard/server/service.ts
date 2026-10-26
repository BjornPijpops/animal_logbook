import type { Database } from "@/db/client";
import { getExpenseSummary } from "@/features/expenses";
import { can, type Ctx } from "@/features/households";
import { getMedicationDashboard, type MedicationDashboard } from "@/features/medications";
import { addDays, localDayStart, utcToLocalParts } from "@/lib/dates";
import { err, ok, type Result } from "@/lib/result";
import {
  createDashboardRepository,
  type DashboardAppointment,
  type DashboardDietChange,
  type DashboardDocument,
  type DashboardFollowUp,
  type DashboardVaccination,
} from "./dashboard.repository";

export type DashboardDeps = { db: Database; now?: () => Date };

// Windows are inclusive local calendar days counted from today.
export const UPCOMING_DAYS = 14;
export const DOCUMENT_DAYS = 60;
export const DIET_DAYS = 30;
export const LIST_LIMIT = 10;

const uuidRe = /^[0-9a-f-]{36}$/i;

export type Limited<T> = { items: T[]; more: boolean };

export type Dashboard = {
  today: string;
  animalId: string | null;
  appointments: Limited<DashboardAppointment>;
  followUps: Limited<DashboardFollowUp>;
  overdueVaccinations: Limited<DashboardVaccination>;
  medications: MedicationDashboard;
  documents: Limited<DashboardDocument>;
  spending: { year: number; month: number; totals: { currency: string; totalMinor: number }[] };
  dietChanges: Limited<DashboardDietChange>;
};

function limited<T>(rows: T[]): Limited<T> {
  return { items: rows.slice(0, LIST_LIMIT), more: rows.length > LIST_LIMIT };
}

// Built only from existing rows; nothing is stored for the dashboard. "Overdue" always means
// "the date the user entered has passed".
export async function getDashboard(
  deps: DashboardDeps,
  ctx: Ctx,
  options: { animalId?: string | null } = {},
): Promise<Result<Dashboard>> {
  if (!can(ctx.role, "data:read")) return err("forbidden", "Not allowed");
  const animalId = options.animalId ?? null;
  if (animalId !== null && !uuidRe.test(animalId)) return err("not_found", "Animal not found");

  const now = (deps.now ?? (() => new Date()))();
  const today = utcToLocalParts(now, ctx.timezone).date;
  const [year, month] = today.split("-").map(Number);
  const repo = createDashboardRepository(deps.db, ctx);
  const medicationDeps = { db: deps.db, now: () => now };
  const fetch = LIST_LIMIT + 1;

  const [appointments, followUps, vaccinations, medications, documents, diet, summary] =
    await Promise.all([
      repo.appointmentsBetween(
        now,
        localDayStart(addDays(today, UPCOMING_DAYS + 1), ctx.timezone),
        animalId,
        fetch,
      ),
      repo.followUpsBetween(today, addDays(today, UPCOMING_DAYS), animalId, fetch),
      repo.overdueVaccinations(today, animalId, fetch),
      getMedicationDashboard(medicationDeps, ctx, animalId ? { animalId } : {}),
      repo.documentsExpiring(today, addDays(today, DOCUMENT_DAYS), animalId, fetch),
      repo.dietChanges(addDays(today, -DIET_DAYS), today, animalId, fetch),
      getExpenseSummary({ db: deps.db }, ctx, { year: year ?? 0, animalId, category: null }),
    ]);
  if (!medications.ok) return medications;
  if (!summary.ok) return summary;

  return ok({
    today,
    animalId,
    appointments: limited(appointments),
    followUps: limited(followUps),
    overdueVaccinations: limited(vaccinations),
    medications: medications.value,
    documents: limited(documents),
    spending: {
      year: year ?? 0,
      month: month ?? 0,
      totals: summary.value.monthly
        .filter((row) => row.month === month)
        .map(({ currency, totalMinor }) => ({ currency, totalMinor }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
    },
    dietChanges: limited(diet),
  });
}
