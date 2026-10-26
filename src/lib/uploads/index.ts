import "server-only";
import { getEnv } from "@/lib/env";
import { ClamAvScanner, NoopScanner, type VirusScanner } from "./virus-scanner";

export function getVirusScanner(): VirusScanner {
  const env = getEnv();
  return env.VIRUS_SCANNER === "clamav"
    ? new ClamAvScanner({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT })
    : new NoopScanner();
}
