import { execSync } from "node:child_process";
import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://animal:animal@localhost:5432/animal_logbook";

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
