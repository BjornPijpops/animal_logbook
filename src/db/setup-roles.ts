import { Client } from "pg";
import { configureRoles } from "./roles";

async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  const app = process.env.APP_DB_PASSWORD;
  const worker = process.env.WORKER_DB_PASSWORD;
  if (!url || !app || !worker) {
    throw new Error("Set DATABASE_OWNER_URL, APP_DB_PASSWORD and WORKER_DB_PASSWORD");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await configureRoles(client, { app, worker });
    console.log("database roles configured");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
