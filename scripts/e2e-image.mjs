import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Runs the Playwright suite against the production image behind Caddy:
//   npm run e2e:image [-- playwright args]
// Set APP_IMAGE to test a prebuilt image (CI) or leave it to build ./Dockerfile locally.
// E2E_KEEP=1 leaves the stack running afterwards.
const compose = [
  "compose",
  ...(process.env.E2E_PROJECT ? ["-p", process.env.E2E_PROJECT] : []),
  "--env-file",
  "docker/e2e.env",
  "-f",
  "docker-compose.prod.yml",
  "-f",
  "docker-compose.e2e.yml",
];
const envFile = Object.fromEntries(
  readFileSync("docker/e2e.env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const pgPort = process.env.E2E_PG_PORT ?? "55432";
const mailUi = process.env.E2E_MAILPIT_UI_PORT ?? "18025";
const dbUrl = (user, password) =>
  `postgres://${user}:${password}@127.0.0.1:${pgPort}/animal_logbook`;

function run(args, options = {}) {
  const result = spawnSync("docker", args, { stdio: "inherit", ...options });
  return result.status ?? 1;
}

const upArgs = [...compose, "up", "-d", "--wait", "--wait-timeout", "240"];
if (!process.env.APP_IMAGE) upArgs.push("--build");
if (run(["compose", "version"]) !== 0) process.exit(1);

let status = run(upArgs);
// The demo household is seeded inside the stack (the uploads volume lives there), through the
// same bundle a public demo instance would use.
if (status === 0) {
  status = run([
    ...compose,
    "exec",
    "-T",
    "-e",
    "ALLOW_DEMO_SEED=true",
    "worker",
    "node",
    "dist/seed-demo.mjs",
  ]);
}
if (status === 0) {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["playwright", "test", ...process.argv.slice(2)],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        E2E_BASE_URL: "https://logbook.localhost:8443",
        E2E_DEMO: "1",
        MAILPIT_URL: `http://127.0.0.1:${mailUi}`,
        DATABASE_OWNER_URL: dbUrl("animal_owner", envFile.POSTGRES_PASSWORD),
        E2E_WORKER_ONCE: `docker ${compose.join(" ")} exec -T worker node dist/run-once.mjs`,
      },
    },
  );
  status = result.status ?? 1;
} else {
  run([...compose, "logs", "--no-color", "--tail", "80"]);
}

if (!process.env.E2E_KEEP) run([...compose, "down", "-v", "--remove-orphans"]);
process.exit(status);
