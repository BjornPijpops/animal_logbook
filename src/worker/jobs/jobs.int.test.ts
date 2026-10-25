import PgBoss from "pg-boss";
import { afterAll, describe, expect, it } from "vitest";
import { HEARTBEAT_QUEUE, registerJobs } from "./index";

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
});
