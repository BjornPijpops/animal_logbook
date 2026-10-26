import { spawn } from "node:child_process";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { roleUrl } from "@/db/roles";
import { setupTestDatabase } from "@/test/db";
import { TEST_WORKER_PASSWORD } from "@/test/roles";

// A cold tsx start plus pg-boss setup took about 12s on a CI runner, so allow generous headroom.
const START_TIMEOUT_MS = 45_000;

// Boots the real entry point (not registerJobs) because the worker once crashed on startup for two
// phases while every unit test stayed green. Fails when it exits early or never logs a heartbeat.
describe("worker entry point", () => {
  const db = setupTestDatabase();

  it("starts and logs a heartbeat without exiting", async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL is not set");
    // A worker killed by an earlier run leaves its jobs behind; start from a clean queue.
    await db.execute(
      sql`do $$ begin
        if to_regclass('pgboss.job') is not null then
          delete from pgboss.job where name = 'heartbeat';
        end if;
      end $$`,
    );
    const workerUrl = roleUrl(url, "animal_worker", TEST_WORKER_PASSWORD);
    const child = spawn(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "src/worker/index.ts"],
      {
        env: {
          ...process.env,
          // As deployed: pg-boss as the owner, everything else as the narrow worker role.
          DATABASE_OWNER_URL: url,
          DATABASE_URL: workerUrl,
          WORKER_DATABASE_URL: workerUrl,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));

    const outcome = await new Promise<"heartbeat" | "exited" | "timeout">((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), START_TIMEOUT_MS);
      const poll = setInterval(() => {
        if (output.includes("worker heartbeat")) resolve("heartbeat");
      }, 100);
      child.once("exit", () => resolve("exited"));
      child.once("close", () => {
        clearTimeout(timer);
        clearInterval(poll);
      });
      setTimeout(() => {
        clearInterval(poll);
      }, START_TIMEOUT_MS + 500);
    });
    const exited = child.exitCode !== null;
    child.kill("SIGKILL");

    expect(outcome, output).toBe("heartbeat");
    expect(exited, output).toBe(false);
  }, 60_000);
});
