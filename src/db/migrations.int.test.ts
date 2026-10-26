import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { describe, expect, it } from "vitest";

const statements = (file: string) =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((sql) => sql.trim())
    .filter(Boolean);

async function withScratchDatabase(run: (pool: Pool) => Promise<void>) {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is not set");
  const name = "animal_logbook_migration_test";
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${name}"`);
  await client.query(`CREATE DATABASE "${name}"`);
  const target = new URL(base);
  target.pathname = `/${name}`;
  const pool = new Pool({ connectionString: target.toString() });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    await run(pool);
  } finally {
    await pool.end();
    await client.query(`DROP DATABASE IF EXISTS "${name}"`);
    await client.end();
  }
}

const runAll = async (pool: Pool, file: string) => {
  for (const sql of statements(file)) await pool.query(sql);
};

describe("migration 0005_medications_reminders_delivery", () => {
  const MIGRATION = "0005_medications_reminders_delivery";
  it("applies, reverses with its down script, and applies again", async () => {
    await withScratchDatabase(async (pool) => {
      const tables = async () =>
        (
          await pool.query<{ table_name: string }>(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
          )
        ).rows.map((row) => row.table_name);
      expect(await tables()).toContain("medication_doses");

      // Later migrations depend on 0005, so they are reversed first.
      await runAll(pool, "./drizzle/down/0012_audit_own_select.down.sql");
      await runAll(pool, "./drizzle/down/0011_account_deletion_pending.down.sql");
      await runAll(pool, "./drizzle/down/0010_audit_and_exports.down.sql");
      await runAll(pool, "./drizzle/down/0009_row_level_security.down.sql");
      await runAll(pool, "./drizzle/down/0008_dashboard_indexes.down.sql");
      await runAll(pool, "./drizzle/down/0007_food_plans.down.sql");
      await runAll(pool, "./drizzle/down/0006_expenses_manual.down.sql");
      await runAll(pool, `./drizzle/down/${MIGRATION}.down.sql`);
      const after = await tables();
      for (const table of [
        "medications",
        "medication_schedules",
        "medication_doses",
        "notification_deliveries",
        "push_subscriptions",
        "notification_preferences",
      ]) {
        expect(after).not.toContain(table);
      }
      expect(after).toContain("reminders");
      const column = await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'reminders' AND column_name = 'expired_at'",
      );
      expect(column.rowCount).toBe(0);

      await runAll(pool, `./drizzle/${MIGRATION}.sql`);
      await runAll(pool, "./drizzle/0006_expenses_manual.sql");
      await runAll(pool, "./drizzle/0007_food_plans.sql");
      await runAll(pool, "./drizzle/0008_dashboard_indexes.sql");
      await runAll(pool, "./drizzle/0009_row_level_security.sql");
      await runAll(pool, "./drizzle/0010_audit_and_exports.sql");
      await runAll(pool, "./drizzle/0011_account_deletion_pending.sql");
      await runAll(pool, "./drizzle/0012_audit_own_select.sql");
      expect(await tables()).toContain("medication_doses");
    });
  });
});

describe("migration 0006_expenses_manual", () => {
  const categories = async (pool: Pool) =>
    (
      await pool.query<{ value: string }>(
        "SELECT unnest(enum_range(NULL::expense_category))::text AS value",
      )
    ).rows.map((row) => row.value);
  const columns = async (pool: Pool) =>
    (
      await pool.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'expenses'",
      )
    ).rows.map((row) => row.column_name);

  it("adds training and the manual-expense columns, and reverses cleanly", async () => {
    await withScratchDatabase(async (pool) => {
      expect(await categories(pool)).toContain("training");
      expect(await columns(pool)).toEqual(
        expect.arrayContaining(["notes", "medication_id", "food_plan_id"]),
      );

      const user = await pool.query<{ id: string }>(
        "INSERT INTO users (name, email, email_verified) VALUES ('U', 'u@example.test', true) RETURNING id",
      );
      const userId = user.rows[0]?.id;
      const household = await pool.query<{ id: string }>(
        "INSERT INTO households (name, created_by) VALUES ('H', $1) RETURNING id",
        [userId],
      );
      const householdId = household.rows[0]?.id;
      await pool.query(
        `INSERT INTO expenses (household_id, category, incurred_on, amount_minor, currency, description)
         VALUES ($1, 'training', '2025-01-01', 500, 'EUR', 'Class')`,
        [householdId],
      );

      await runAll(pool, "./drizzle/down/0006_expenses_manual.down.sql");
      expect(await categories(pool)).not.toContain("training");
      expect(await columns(pool)).not.toContain("notes");
      const kept = await pool.query<{ category: string }>("SELECT category::text FROM expenses");
      expect(kept.rows[0]?.category).toBe("other");

      await runAll(pool, "./drizzle/0006_expenses_manual.sql");
      expect(await categories(pool)).toContain("training");
      expect(await columns(pool)).toContain("food_plan_id");
    });
  });

  it("moves existing training appointment expenses to the training category", async () => {
    await withScratchDatabase(async (pool) => {
      await runAll(pool, "./drizzle/down/0006_expenses_manual.down.sql");
      const user = await pool.query<{ id: string }>(
        "INSERT INTO users (name, email, email_verified) VALUES ('U', 'u2@example.test', true) RETURNING id",
      );
      const household = await pool.query<{ id: string }>(
        "INSERT INTO households (name, created_by) VALUES ('H', $1) RETURNING id",
        [user.rows[0]?.id],
      );
      const householdId = household.rows[0]?.id;
      const appointment = await pool.query<{ id: string }>(
        `INSERT INTO appointments (household_id, type, title, scheduled_at, timezone)
         VALUES ($1, 'training', 'Puppy class', now(), 'UTC') RETURNING id`,
        [householdId],
      );
      await pool.query(
        `INSERT INTO expenses (household_id, category, incurred_on, amount_minor, currency, description, appointment_id)
         VALUES ($1, 'other', '2025-01-01', 500, 'EUR', 'Puppy class', $2)`,
        [householdId, appointment.rows[0]?.id],
      );
      await runAll(pool, "./drizzle/0006_expenses_manual.sql");
      const row = await pool.query<{ category: string }>("SELECT category::text FROM expenses");
      expect(row.rows[0]?.category).toBe("training");
    });
  });
});

describe("migration 0007_food_plans", () => {
  const tableNames = async (pool: Pool) =>
    (
      await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      )
    ).rows.map((row) => row.table_name);

  it("adds food tables and the expense link, reverses cleanly and clears orphans on re-apply", async () => {
    await withScratchDatabase(async (pool) => {
      expect(await tableNames(pool)).toEqual(expect.arrayContaining(["food_plans", "food_meals"]));

      await runAll(pool, "./drizzle/down/0007_food_plans.down.sql");
      expect(await tableNames(pool)).not.toContain("food_plans");
      const type = await pool.query("SELECT 1 FROM pg_type WHERE typname = 'food_type'");
      expect(type.rowCount).toBe(0);

      const user = await pool.query<{ id: string }>(
        "INSERT INTO users (name, email, email_verified) VALUES ('U', 'u3@example.test', true) RETURNING id",
      );
      const household = await pool.query<{ id: string }>(
        "INSERT INTO households (name, created_by) VALUES ('H', $1) RETURNING id",
        [user.rows[0]?.id],
      );
      const householdId = household.rows[0]?.id;
      await pool.query(
        `INSERT INTO expenses (household_id, category, incurred_on, amount_minor, currency, description, food_plan_id)
         VALUES ($1, 'food', '2025-01-01', 500, 'EUR', 'Orphan', gen_random_uuid())`,
        [householdId],
      );

      await runAll(pool, "./drizzle/0007_food_plans.sql");
      const row = await pool.query<{ food_plan_id: string | null; amount_minor: number }>(
        "SELECT food_plan_id, amount_minor FROM expenses",
      );
      expect(row.rows[0]).toEqual({ food_plan_id: null, amount_minor: 500 });
      expect(await tableNames(pool)).toContain("food_meals");

      await expect(
        pool.query(
          `INSERT INTO expenses (household_id, category, incurred_on, amount_minor, currency, description, food_plan_id)
           VALUES ($1, 'food', '2025-01-01', 1, 'EUR', 'Bad link', gen_random_uuid())`,
          [householdId],
        ),
      ).rejects.toThrow();
    });
  });
});

describe("migration 0008_dashboard_indexes", () => {
  const NAMES = [
    "appointments_follow_up_idx",
    "medical_records_next_due_idx",
    "medication_doses_household_time_idx",
  ];
  const present = async (pool: Pool) =>
    (
      await pool.query<{ indexname: string }>(
        "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)",
        [NAMES],
      )
    ).rows
      .map((row) => row.indexname)
      .sort();

  it("adds the indexes, removes them on down and adds them again", async () => {
    await withScratchDatabase(async (pool) => {
      expect(await present(pool)).toEqual([...NAMES].sort());
      await runAll(pool, "./drizzle/down/0008_dashboard_indexes.down.sql");
      expect(await present(pool)).toEqual([]);
      await runAll(pool, "./drizzle/0008_dashboard_indexes.sql");
      expect(await present(pool)).toEqual([...NAMES].sort());
    });
  });
});

describe("migration 0009_row_level_security", () => {
  const state = async (pool: Pool) => {
    const forced = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relforcerowsecurity",
    );
    const policies = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_policies WHERE schemaname = 'public'",
    );
    const functions = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_proc WHERE proname IN ('app_user_id', 'app_household_id', 'app_invite_hash', 'app_is_member')",
    );
    return {
      forced: forced.rows[0]?.count,
      policies: policies.rows[0]?.count,
      functions: functions.rows[0]?.count,
    };
  };

  it("enables forced RLS, reverses to a plain schema and applies again", async () => {
    await withScratchDatabase(async (pool) => {
      await runAll(pool, "./drizzle/down/0012_audit_own_select.down.sql");
      await runAll(pool, "./drizzle/down/0011_account_deletion_pending.down.sql");
      await runAll(pool, "./drizzle/down/0010_audit_and_exports.down.sql");
      const applied = await state(pool);
      expect(applied.forced).toBe(21);
      expect(applied.policies).toBeGreaterThan(40);
      expect(applied.functions).toBe(4);

      await runAll(pool, "./drizzle/down/0009_row_level_security.down.sql");
      expect(await state(pool)).toEqual({ forced: 0, policies: 0, functions: 0 });

      await runAll(pool, "./drizzle/0009_row_level_security.sql");
      expect(await state(pool)).toEqual(applied);
      await runAll(pool, "./drizzle/0010_audit_and_exports.sql");
      await runAll(pool, "./drizzle/0011_account_deletion_pending.sql");
      await runAll(pool, "./drizzle/0012_audit_own_select.sql");
    });
  });
});

describe("migration 0010_audit_and_exports", () => {
  const present = async (pool: Pool) =>
    (
      await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('audit_log', 'data_exports')",
      )
    ).rows
      .map((row) => row.table_name)
      .sort();

  it("adds both tables under forced RLS, reverses and applies again", async () => {
    await withScratchDatabase(async (pool) => {
      expect(await present(pool)).toEqual(["audit_log", "data_exports"]);
      const forced = await pool.query(
        "SELECT 1 FROM pg_class WHERE relname IN ('audit_log', 'data_exports') AND relforcerowsecurity",
      );
      expect(forced.rowCount).toBe(2);

      await runAll(pool, "./drizzle/down/0012_audit_own_select.down.sql");
      await runAll(pool, "./drizzle/down/0011_account_deletion_pending.down.sql");
      await runAll(pool, "./drizzle/down/0010_audit_and_exports.down.sql");
      expect(await present(pool)).toEqual([]);
      const fn = await pool.query("SELECT 1 FROM pg_proc WHERE proname = 'app_is_owner'");
      expect(fn.rowCount).toBe(0);

      await runAll(pool, "./drizzle/0010_audit_and_exports.sql");
      await runAll(pool, "./drizzle/0011_account_deletion_pending.sql");
      await runAll(pool, "./drizzle/0012_audit_own_select.sql");
      expect(await present(pool)).toEqual(["audit_log", "data_exports"]);
    });
  });
});

describe("migration 0011_account_deletion_pending", () => {
  const hasColumn = async (pool: Pool) =>
    (
      await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'deletion_requested_at'",
      )
    ).rowCount === 1;

  it("adds the pending marker, reverses and applies again", async () => {
    await withScratchDatabase(async (pool) => {
      expect(await hasColumn(pool)).toBe(true);
      await runAll(pool, "./drizzle/down/0011_account_deletion_pending.down.sql");
      expect(await hasColumn(pool)).toBe(false);
      await runAll(pool, "./drizzle/0011_account_deletion_pending.sql");
      expect(await hasColumn(pool)).toBe(true);
    });
  });
});

describe("migration 0012_audit_own_select", () => {
  const policies = async (pool: Pool) =>
    (
      await pool.query(
        "SELECT 1 FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'audit_log_own_select'",
      )
    ).rowCount;

  it("adds the own-entries policy, reverses and applies again", async () => {
    await withScratchDatabase(async (pool) => {
      expect(await policies(pool)).toBe(1);
      await runAll(pool, "./drizzle/down/0012_audit_own_select.down.sql");
      expect(await policies(pool)).toBe(0);
      await runAll(pool, "./drizzle/0012_audit_own_select.sql");
      expect(await policies(pool)).toBe(1);
    });
  });
});
