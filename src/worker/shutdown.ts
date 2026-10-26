type Stoppable = { stop(options: { graceful: boolean; timeout: number }): Promise<void> };
type Closable = { end(): Promise<void> };

export type ShutdownDeps = {
  boss: Stoppable;
  pools: Closable[];
  timeoutMs: number;
  exit: (code: number) => void;
  log: (message: string, extra?: Record<string, unknown>) => void;
};

// SIGTERM handler: stop taking jobs, give running ones `timeoutMs` to finish (pg-boss then releases
// them back to the queue, and every job is idempotent), close the pools, exit. The timeout must stay
// below the container stop grace period or Docker sends SIGKILL first.
export function createShutdown(deps: ShutdownDeps): (signal: string) => Promise<void> {
  let running: Promise<void> | undefined;
  return (signal) => {
    running ??= (async () => {
      deps.log("worker stopping", { signal });
      let code = 0;
      try {
        await deps.boss.stop({ graceful: true, timeout: deps.timeoutMs });
      } catch (error) {
        code = 1;
        deps.log("worker stop failed", {
          error: error instanceof Error ? error.message : "unknown",
        });
      }
      for (const pool of deps.pools) await pool.end().catch(() => undefined);
      deps.exit(code);
    })();
    return running;
  };
}
