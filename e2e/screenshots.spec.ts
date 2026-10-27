import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "./fixtures";
import { signUpAndVerify } from "./helpers";

// Review screenshots, not assertions. Run through the e2e image stack (demo household seeded):
//   E2E_SCREENSHOTS=1 SCREENSHOT_LABEL=after npm run e2e:image -- e2e/screenshots.spec.ts
// Files go to $SCREENSHOT_DIR (default ./screenshots, git-ignored) as <label>-<scenario>-<width>.png.
// CI runs it for the base commit ("before") and the PR ("after") and uploads the folder.
test.skip(
  !process.env.E2E_SCREENSHOTS || !process.env.E2E_DEMO,
  "set E2E_SCREENSHOTS=1 and run through npm run e2e:image",
);

const label = process.env.SCREENSHOT_LABEL ?? "after";
const dir = process.env.SCREENSHOT_DIR ?? "screenshots";
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
const PASSWORD = "DemoPassword-2024!";

async function shoot(page: import("@playwright/test").Page, scenario: string) {
  mkdirSync(dir, { recursive: true });
  for (const size of WIDTHS) {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(dir, `${label}-${scenario}-${size.width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
}

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hello");
}

test("dashboard screenshots: demo owner", async ({ page }) => {
  await signIn(page, "demo-owner@example.test");
  await shoot(page, "owner");
});

test("dashboard screenshots: demo viewer", async ({ page }) => {
  await signIn(page, "demo-viewer@example.test");
  await shoot(page, "viewer");
});

test("dashboard screenshots: household without data", async ({ page, request }) => {
  await signUpAndVerify(page, request, "shot");
  await shoot(page, "empty");
});
