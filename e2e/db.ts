import { execSync } from "node:child_process";
import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_OWNER_URL ??
  process.env.DATABASE_URL ??
  "postgres://animal:animal@localhost:5432/animal_logbook";

export async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

// Reminders and adherence only count from when a schedule was saved, so a test that needs a dose
// that is already due moves that moment into the past instead of waiting for the clock.
export async function backdateSchedules(medicationName: string, hours: number) {
  await withDb((client) =>
    client.query(
      `UPDATE medication_schedules s SET updated_at = now() - make_interval(hours => $2)
       FROM medications m JOIN medical_records r ON r.id = m.medical_record_id
       WHERE s.medication_id = m.id AND r.title = $1`,
      [medicationName, hours],
    ),
  );
}

export async function householdTimezone(email: string): Promise<string> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ timezone: string }>(
      `SELECT h.timezone FROM households h
       JOIN household_members hm ON hm.household_id = h.id
       JOIN users u ON u.id = hm.user_id WHERE u.email = $1 LIMIT 1`,
      [email],
    );
    return rows[0]?.timezone ?? "UTC";
  });
}

// One generate + deliver pass of the worker, using the real email channel (Mailpit in dev and CI).
export function runWorkerOnce() {
  execSync("npm run worker:once", { stdio: "pipe" });
}

// Rows for the dashboard test: dates are offset by several days so the household time zone never
// changes which side of a boundary they fall on.
export async function seedDashboardData(email: string, animalName: string) {
  await withDb(async (client) => {
    const { rows } = await client.query<{ household_id: string; animal_id: string }>(
      `SELECT hm.household_id, a.id AS animal_id FROM users u
       JOIN household_members hm ON hm.user_id = u.id
       JOIN animals a ON a.household_id = hm.household_id AND a.name = $2
       WHERE u.email = $1 LIMIT 1`,
      [email, animalName],
    );
    const ids = rows[0];
    if (!ids) throw new Error("Household or animal not found");
    const { household_id: household, animal_id: animal } = ids;
    await client.query(
      `INSERT INTO medical_records (household_id, animal_id, type, title, started_on, next_due_on)
       VALUES ($1, $2, 'vaccination', 'Rabies booster', current_date - 400, current_date - 3)`,
      [household, animal],
    );
    await client.query(
      `INSERT INTO appointments (household_id, animal_id, type, title, scheduled_at, timezone, follow_up_date)
       VALUES ($1, $2, 'vet', 'Dental check', now() - interval '20 days', 'UTC', current_date + 3),
              ($1, $2, 'grooming', 'Spring trim', now() + interval '2 days', 'UTC', NULL)`,
      [household, animal],
    );
    await client.query(
      `INSERT INTO documents (household_id, animal_id, type, title, expires_on)
       VALUES ($1, $2, 'insurance', 'Pet insurance', current_date + 10)`,
      [household, animal],
    );
  });
}
