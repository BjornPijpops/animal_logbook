import { resolve } from "node:path";
import { createTestDatabase } from "@/db/client";
import { LocalDiskAdapter } from "@/lib/storage/local-disk";
import { DEMO_OWNER, DEMO_PASSWORD, DEMO_VIEWER } from "./constants";
import { seedDemo } from "./seed";

// Refuses production unless explicitly allowed, and only ever touches the fixed demo ids.
export function assertDemoSeedAllowed(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === "production" && env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to seed demo data when NODE_ENV=production. Set ALLOW_DEMO_SEED=true only on a " +
        "throwaway demo instance, never on a database that holds a real household.",
    );
  }
}

export async function runDemoSeed(): Promise<void> {
  assertDemoSeedAllowed(process.env);
  const { DATABASE_OWNER_URL: owner, DATABASE_URL: app, WORKER_DATABASE_URL: worker } = process.env;
  if (!owner || !app || !worker) {
    throw new Error("DATABASE_OWNER_URL, DATABASE_URL and WORKER_DATABASE_URL must all be set");
  }
  const reset = process.argv.includes("--reset");
  const { db, pools } = createTestDatabase({ owner, app, worker });
  try {
    const storage = new LocalDiskAdapter(resolve(process.env.UPLOAD_DIR ?? "./data/uploads"));
    const result = await seedDemo({ db, storage, log: (m) => console.warn(m) }, { reset });
    const url = process.env.APP_URL ?? "http://localhost:3000";
    console.warn(
      [
        "",
        result.created ? "Demo ready." : "Demo already present (run with --reset to recreate).",
        `  URL:      ${url}`,
        `  Owner:    ${DEMO_OWNER.email}`,
        `  Viewer:   ${DEMO_VIEWER.email} (read-only)`,
        `  Password: ${DEMO_PASSWORD}`,
        "  All data is fictional. Nothing is ever emailed or pushed to these accounts.",
      ].join("\n"),
    );
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
  }
}
