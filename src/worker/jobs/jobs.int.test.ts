import PgBoss from "pg-boss";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";
import { createMemoryStorage } from "@/test/db";
import { FILE_PURGE_QUEUE, HEARTBEAT_QUEUE, registerJobs } from "./index";

describe("worker", () => {
  it("processes a heartbeat job", async () => {
    const boss = new PgBoss({
      connectionString: process.env.TEST_DATABASE_URL ?? "",
      schema: "pgboss_test",
    });
    afterAll(async () => {
      await boss.stop({ graceful: false });
    });
    await boss.start();

    let beats = 0;
    await registerJobs(boss, { onHeartbeat: () => beats++ });
    await boss.send(HEARTBEAT_QUEUE, {});

    await expect.poll(() => beats, { timeout: 15_000, interval: 200 }).toBeGreaterThan(0);
  });

  it("runs the file purge job through the queue", async () => {
    const boss = new PgBoss({
      connectionString: process.env.TEST_DATABASE_URL ?? "",
      schema: "pgboss_test",
    });
    const { db, pool } = createDatabase(process.env.TEST_DATABASE_URL ?? "");
    afterAll(async () => {
      await boss.stop({ graceful: false });
      await pool.end();
    });
    await boss.start();

    let reports = 0;
    await registerJobs(
      boss,
      { onPurge: () => reports++ },
      {
        db,
        storage: createMemoryStorage(),
        retentionDays: 30,
      },
    );
    await boss.send(FILE_PURGE_QUEUE, {});

    await expect.poll(() => reports, { timeout: 15_000, interval: 200 }).toBeGreaterThan(0);
  });
});
