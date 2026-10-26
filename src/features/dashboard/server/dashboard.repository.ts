import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbExecutor } from "@/db/client";
import { animals, appointments, documents, foodPlans, medicalRecords } from "@/db/schema";

export type DashboardAppointment = {
  id: string;
  title: string;
  type: string;
  scheduledAt: Date;
  animalId: string | null;
  animalName: string | null;
};
export type DashboardFollowUp = {
  appointmentId: string;
  title: string;
  followUpDate: string;
  animalId: string | null;
  animalName: string | null;
};
export type DashboardVaccination = {
  id: string;
  animalId: string;
  animalName: string;
  title: string;
  nextDueOn: string;
};
export type DashboardDocument = {
  id: string;
  title: string;
  type: string;
  expiresOn: string;
  animalId: string | null;
  animalName: string | null;
};
export type DashboardDietChange = {
  planId: string;
  animalId: string;
  animalName: string;
  label: string;
  kind: "started" | "ended";
  date: string;
};

// Every query is scoped to one household, optionally one animal, and ends in LIMIT. Callers ask
// for `limit` rows and the service trims, so "more exist" can be shown without counting.
export function createDashboardRepository(db: DbExecutor, householdId: string) {
  const animalScope = (
    column: Parameters<typeof eq>[0],
    animalId: string | null,
  ): SQL | undefined => (animalId ? eq(column, animalId) : undefined);

  return {
    async appointmentsBetween(
      from: Date,
      to: Date,
      animalId: string | null,
      limit: number,
    ): Promise<DashboardAppointment[]> {
      return db
        .select({
          id: appointments.id,
          title: appointments.title,
          type: appointments.type,
          scheduledAt: appointments.scheduledAt,
          animalId: appointments.animalId,
          animalName: animals.name,
        })
        .from(appointments)
        .leftJoin(
          animals,
          and(
            eq(animals.id, appointments.animalId),
            eq(animals.householdId, appointments.householdId),
          ),
        )
        .where(
          and(
            eq(appointments.householdId, householdId),
            isNull(appointments.deletedAt),
            or(isNull(appointments.animalId), isNull(animals.deletedAt)),
            gte(appointments.scheduledAt, from),
            lt(appointments.scheduledAt, to),
            animalScope(appointments.animalId, animalId),
          ),
        )
        .orderBy(asc(appointments.scheduledAt))
        .limit(limit);
    },

    async followUpsBetween(
      from: string,
      to: string,
      animalId: string | null,
      limit: number,
    ): Promise<DashboardFollowUp[]> {
      const rows = await db
        .select({
          appointmentId: appointments.id,
          title: appointments.title,
          followUpDate: appointments.followUpDate,
          animalId: appointments.animalId,
          animalName: animals.name,
        })
        .from(appointments)
        .leftJoin(
          animals,
          and(
            eq(animals.id, appointments.animalId),
            eq(animals.householdId, appointments.householdId),
          ),
        )
        .where(
          and(
            eq(appointments.householdId, householdId),
            isNull(appointments.deletedAt),
            or(isNull(appointments.animalId), isNull(animals.deletedAt)),
            gte(appointments.followUpDate, from),
            lte(appointments.followUpDate, to),
            animalScope(appointments.animalId, animalId),
          ),
        )
        .orderBy(asc(appointments.followUpDate), asc(appointments.id))
        .limit(limit);
      return rows.flatMap((row) =>
        row.followUpDate ? [{ ...row, followUpDate: row.followUpDate }] : [],
      );
    },

    // A vaccination is overdue when its entered next-due date is before today and no newer
    // record of the same vaccine exists for that animal (a newer record supersedes it).
    async overdueVaccinations(
      today: string,
      animalId: string | null,
      limit: number,
    ): Promise<DashboardVaccination[]> {
      const newer = alias(medicalRecords, "newer");
      const rows = await db
        .select({
          id: medicalRecords.id,
          animalId: medicalRecords.animalId,
          animalName: animals.name,
          title: medicalRecords.title,
          nextDueOn: medicalRecords.nextDueOn,
        })
        .from(medicalRecords)
        .innerJoin(
          animals,
          and(
            eq(animals.id, medicalRecords.animalId),
            eq(animals.householdId, medicalRecords.householdId),
          ),
        )
        .where(
          and(
            eq(medicalRecords.householdId, householdId),
            eq(medicalRecords.type, "vaccination"),
            isNull(medicalRecords.deletedAt),
            isNull(animals.deletedAt),
            isNotNull(medicalRecords.nextDueOn),
            lt(medicalRecords.nextDueOn, today),
            animalScope(medicalRecords.animalId, animalId),
            notExists(
              db
                .select({ one: sql`1` })
                .from(newer)
                .where(
                  and(
                    eq(newer.householdId, medicalRecords.householdId),
                    eq(newer.animalId, medicalRecords.animalId),
                    eq(newer.type, "vaccination"),
                    isNull(newer.deletedAt),
                    sql`lower(${newer.title}) = lower(${medicalRecords.title})`,
                    sql`${newer.startedOn} > ${medicalRecords.startedOn}`,
                  ),
                ),
            ),
          ),
        )
        .orderBy(asc(medicalRecords.nextDueOn), asc(medicalRecords.id))
        .limit(limit);
      return rows.flatMap((row) => (row.nextDueOn ? [{ ...row, nextDueOn: row.nextDueOn }] : []));
    },

    async documentsExpiring(
      from: string,
      to: string,
      animalId: string | null,
      limit: number,
    ): Promise<DashboardDocument[]> {
      const rows = await db
        .select({
          id: documents.id,
          title: documents.title,
          type: documents.type,
          expiresOn: documents.expiresOn,
          animalId: documents.animalId,
          animalName: animals.name,
        })
        .from(documents)
        .leftJoin(
          animals,
          and(eq(animals.id, documents.animalId), eq(animals.householdId, documents.householdId)),
        )
        .where(
          and(
            eq(documents.householdId, householdId),
            isNull(documents.deletedAt),
            or(isNull(documents.animalId), isNull(animals.deletedAt)),
            gte(documents.expiresOn, from),
            lte(documents.expiresOn, to),
            animalScope(documents.animalId, animalId),
          ),
        )
        .orderBy(asc(documents.expiresOn), asc(documents.id))
        .limit(limit);
      return rows.flatMap((row) => (row.expiresOn ? [{ ...row, expiresOn: row.expiresOn }] : []));
    },

    // Plan starts and ends in [from, to], newest first. Two bounded selects merged in memory.
    async dietChanges(
      from: string,
      to: string,
      animalId: string | null,
      limit: number,
    ): Promise<DashboardDietChange[]> {
      const select = async (kind: "started" | "ended") => {
        const dateColumn = kind === "started" ? foodPlans.startedOn : foodPlans.endedOn;
        const rows = await db
          .select({
            planId: foodPlans.id,
            animalId: foodPlans.animalId,
            animalName: animals.name,
            brand: foodPlans.brand,
            flavor: foodPlans.flavor,
            date: dateColumn,
          })
          .from(foodPlans)
          .innerJoin(
            animals,
            and(eq(animals.id, foodPlans.animalId), eq(animals.householdId, foodPlans.householdId)),
          )
          .where(
            and(
              eq(foodPlans.householdId, householdId),
              isNull(foodPlans.deletedAt),
              isNull(animals.deletedAt),
              gte(dateColumn, from),
              lte(dateColumn, to),
              animalScope(foodPlans.animalId, animalId),
            ),
          )
          .orderBy(desc(dateColumn), desc(foodPlans.id))
          .limit(limit);
        return rows.flatMap(({ brand, flavor, date, ...rest }) =>
          date ? [{ ...rest, kind, date, label: flavor ? `${brand} ${flavor}` : brand }] : [],
        );
      };
      const merged = [...(await select("started")), ...(await select("ended"))];
      return merged
        .sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind))
        .slice(0, limit);
    },
  };
}
