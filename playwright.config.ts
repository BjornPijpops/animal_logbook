import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL points the suite at an already running stack (the production image behind Caddy,
// see scripts/e2e-image.mjs). Without it the config builds and starts the app itself.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Capped locally: with one worker per core the production server and Mailpit time out under load.
  workers: process.env.CI ? 3 : 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: external ?? "http://localhost:3000",
    ignoreHTTPSErrors: Boolean(external),
    trace: "on-first-retry",
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: external
    ? undefined
    : {
        // A production build: the dev server compiles routes on demand, which made parallel workers time out.
        // Set E2E_DEV=1 to use the dev server for quick local iteration.
        command: process.env.E2E_DEV ? "npm run dev" : "npm run build && npm run start",
        timeout: 300_000,
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        // Tests send a distinct X-Forwarded-For per test; the app ignores it unless this is on.
        env: { TRUSTED_PROXY: "true" },
      },
});
