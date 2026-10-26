import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

const START_TIMEOUT_MS = 20_000;

// Boots the real entry point (not registerJobs) because the worker once crashed on startup for two
// phases while every unit test stayed green. Fails when it exits early or never logs a heartbeat.
describe("worker entry point", () => {
  it("starts and logs a heartbeat without exiting", async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL is not set");
    const child = spawn(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "src/worker/index.ts"],
      {
        env: { ...process.env, DATABASE_URL: url },
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
  }, 30_000);
});
