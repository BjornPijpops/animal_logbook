import PgBoss from "pg-boss";
import { errorReporter } from "@/lib/error-reporter";
import { logger } from "@/lib/logger";
import { registerJobs } from "./jobs";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const boss = new PgBoss(url);
  boss.on("error", (error) => errorReporter.report(error, { source: "pg-boss" }));
  await boss.start();
  await registerJobs(boss);
  logger.info("worker started");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker stopping");
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  errorReporter.report(error, { source: "worker" });
  process.exit(1);
});
