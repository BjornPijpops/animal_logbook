import { runDemoSeed } from "./cli";

runDemoSeed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
