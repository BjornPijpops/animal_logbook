import { scopeDb, type Tenant } from "@/db/scope";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DbExecutor } from "@/db/client";
import type { TimelineQuery } from "../schemas";

const rowSchema = z.object({
  kind: z.enum(["appointment", "record"]),
  id: z.uuid(),
  type: z.string(),
  title: z.string(),
  animal_id: z.uuid().nullable(),
  animal_name: z.string().nullable(),
  local_date: z.string(),
  cost_minor: z.number().nullable(),
  currency: z.string().nullable(),
  deleted_at: z.union([z.date(), z.string().transform((value) => new Date(value))]).nullable(),
  total: z.coerce.number(),
});

export type TimelineItem = {
  kind: "appointment" | "record";
  id: string;
  type: string;
  title: string;
  animalId: string | null;
  animalName: string | null;
  localDate: string;
  costMinor: number | null;
  currency: string | null;
  deletedAt: Date | null;
};

type Page = { limit: number; offset: number; timezone: string };

// Appointments and medical records are read as one list. Dates are compared as household-local
// calendar days so a late-evening visit lands on the day the household experienced it.
export function createTimelineRepository(executor: DbExecutor, tenant: Tenant) {
  const db = scopeDb(executor, tenant);
  const { householdId } = tenant;
  return {
    async list(
      query: TimelineQuery,
      page: Page,
    ): Promise<{ items: TimelineItem[]; total: number }> {
      const tz = page.timezone;
      const conditions: SQL[] = [
        query.deleted ? sql`i.deleted_at is not null` : sql`i.deleted_at is null`,
      ];
      if (query.animal === "household") conditions.push(sql`i.animal_id is null`);
      else if (query.animal !== "") conditions.push(sql`i.animal_id = ${query.animal}::uuid`);
      if (query.type !== "") {
        const [kind, type] = query.type.split(":");
        conditions.push(sql`i.kind = ${kind}`);
        if (type) conditions.push(sql`i.type = ${type}`);
      }
      if (query.from !== "") conditions.push(sql`i.local_date >= ${query.from}::date`);
      if (query.to !== "") conditions.push(sql`i.local_date <= ${query.to}::date`);

      const result = await db.execute(sql`
        with items as (
          select 'appointment'::text as kind, a.id, a.type::text as type, a.title, a.animal_id,
                 a.scheduled_at as sort_at,
                 (a.scheduled_at at time zone ${tz})::date as local_date,
                 a.cost_minor, a.currency::text as currency, a.deleted_at
          from appointments a where a.household_id = ${householdId}::uuid
          union all
          select 'record'::text, m.id, m.type::text, m.title, m.animal_id,
                 (m.started_on::timestamp at time zone ${tz}),
                 m.started_on, null::integer, null::text, m.deleted_at
          from medical_records m where m.household_id = ${householdId}::uuid
        )
        select i.kind, i.id, i.type, i.title, i.animal_id, an.name as animal_name,
               to_char(i.local_date, 'YYYY-MM-DD') as local_date,
               i.cost_minor, i.currency, i.deleted_at,
               count(*) over() as total
        from items i
        left join animals an on an.id = i.animal_id and an.household_id = ${householdId}::uuid
        where ${sql.join(conditions, sql` and `)}
        order by i.sort_at desc, i.id
        limit ${page.limit} offset ${page.offset}
      `);
      const rows = result.rows.map((row) => rowSchema.parse(row));
      return {
        total: rows[0]?.total ?? 0,
        items: rows.map((r) => ({
          kind: r.kind,
          id: r.id,
          type: r.type,
          title: r.title,
          animalId: r.animal_id,
          animalName: r.animal_name,
          localDate: r.local_date,
          costMinor: r.cost_minor,
          currency: r.currency,
          deletedAt: r.deleted_at,
        })),
      };
    },
  };
}
