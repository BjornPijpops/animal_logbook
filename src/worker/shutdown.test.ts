import { describe, expect, it, vi } from "vitest";
import { createShutdown } from "./shutdown";

function setup(stop: () => Promise<void> = () => Promise.resolve()) {
  const order: string[] = [];
  const boss = {
    stop: vi.fn(async () => {
      order.push("stop");
      await stop();
    }),
  };
  const pool = { end: vi.fn(async () => void order.push("pool")) };
  const exit = vi.fn((code: number) => void order.push(`exit${code}`));
  const shutdown = createShutdown({ boss, pools: [pool], timeoutMs: 20_000, exit, log: () => {} });
  return { boss, pool, exit, order, shutdown };
}

describe("worker shutdown", () => {
  it("stops gracefully with a timeout, closes pools, then exits 0", async () => {
    const { boss, order, shutdown } = setup();
    await shutdown("SIGTERM");
    expect(boss.stop).toHaveBeenCalledWith({ graceful: true, timeout: 20_000 });
    expect(order).toEqual(["stop", "pool", "exit0"]);
  });

  it("runs once even when signalled twice", async () => {
    const { boss, exit, shutdown } = setup();
    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);
    expect(boss.stop).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("exits non-zero when stopping fails but still closes pools", async () => {
    const { pool, exit, shutdown } = setup(() => Promise.reject(new Error("boom")));
    await shutdown("SIGTERM");
    expect(pool.end).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
