import { Pool } from "pg";
import { applyMigrations, rollbackLastMigration } from "./migrate-lib";
import { configureRoles } from "./roles";

// Production entry point of the one-shot migrate service. It runs as the owner role:
//   node dist/migrate.mjs          apply pending migrations, then (re)configure the app roles
//   node dist/migrate.mjs down     reverse the most recent migration with its down script
async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL;
  const app = process.env.APP_DB_PASSWORD;
  const worker = process.env.WORKER_DB_PASSWORD;
  if (!url || !app || !worker) {
    throw new Error("Set DATABASE_OWNER_URL, APP_DB_PASSWORD and WORKER_DB_PASSWORD");
  }
  const folder = process.env.MIGRATIONS_DIR ?? "./drizzle";
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    if (process.argv[2] === "down") {
      const reverted = await rollbackLastMigration(pool, folder);
      console.log(reverted ? `reverted ${reverted.tag}` : "nothing to revert");
      return;
    }
    await applyMigrations(pool, folder);
    await configureRoles(pool, { app, worker });
    console.log("migrations applied, database roles configured");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "migration failed");
  process.exit(1);
});
