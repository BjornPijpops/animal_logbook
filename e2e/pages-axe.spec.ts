import { expect, test } from "./fixtures";
import { expectNoA11yViolations } from "./helpers";

// The page background tint is global, so pages that are not restyled yet still need to pass axe.
test.skip(!process.env.E2E_DEMO, "run through npm run e2e:image, which seeds the demo");

const PAGES = ["/animals", "/expenses", "/documents", "/settings", "/medications", "/timeline"];

test("axe: pages that keep the old card style, with the tinted background", async ({ page }) => {
  test.slow();
  await page.goto("/sign-in");
  await expectNoA11yViolations(page);
  await page.getByLabel("Email").fill("demo-owner@example.test");
  await page.getByLabel("Password").fill("DemoPassword-2024!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoA11yViolations(page);
    }
  }
});
