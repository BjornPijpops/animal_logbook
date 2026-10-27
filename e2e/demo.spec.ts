import { expect, test } from "./fixtures";
import { expectNoA11yViolations } from "./helpers";

// Needs the demo household: `npm run e2e:image` seeds it inside the stack and sets E2E_DEMO=1.
test.skip(!process.env.E2E_DEMO, "run through npm run e2e:image, which seeds the demo");

const OWNER = "demo-owner@example.test";
const PASSWORD = "DemoPassword-2024!";

test("demo: owner sees the dashboard, weight markers, expense charts and investigation", async ({
  page,
}) => {
  test.slow();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(OWNER);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Hello, Demo Owner/ })).toBeVisible();

  const comingUp = page.getByRole("region", { name: "Coming up" });
  // The follow-up date on the check-up is listed once, not twice.
  await expect(
    comingUp.getByRole("link", { name: "Follow-up: Skin irritation check-up", exact: true }),
  ).toHaveCount(1);
  await expect(comingUp.getByRole("link", { name: /skin irritation/i })).toHaveCount(1);
  const vaccinations = page.getByRole("region", { name: "Vaccination dates passed" });
  await expect(vaccinations.getByRole("link", { name: "Rabies booster" })).toBeVisible();
  const today = page.getByRole("region", { name: "Today" });
  await expect(today.getByRole("link", { name: /Skin soothing tablets/ }).first()).toBeVisible();
  await expect(today.getByRole("button", { name: /^Given:/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Luna" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Milo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View expenses" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/animals");
  await expect(page.getByRole("link", { name: /Luna/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Milo/ }).first()).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: /Luna/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Luna" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Food changes" })).toBeVisible();
  const markers = page.getByRole("table", { name: /Food plan starts and ends/ });
  await expect(markers).toContainText("Started: Northfield");
  await expect(markers).toContainText("Ended: Orchard Farm");
  await expectNoA11yViolations(page);

  await page.goto("/expenses");
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Total/ })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole("link", { name: "Annual", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Annual" })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole("link", { name: "By category" }).click();
  for (const category of ["Vet", "Food", "Insurance", "Grooming", "Toys", "Medication"]) {
    await expect(page.getByRole("row", { name: new RegExp(`^${category}`) })).toBeVisible();
  }
  await expectNoA11yViolations(page);

  await page.goto("/food/investigation");
  await expect(
    page.getByRole("heading", { level: 1, name: "Allergy investigation" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: /^Skin irritation/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /^Chicken/ })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("demo: the viewer can read but not edit", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("demo-viewer@example.test");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Hello, Demo Viewer/ })).toBeVisible();
  // Viewers see today's doses but get no Given/Skipped buttons.
  const today = page.getByRole("region", { name: "Today" });
  await expect(today.getByRole("link", { name: /Skin soothing tablets/ }).first()).toBeVisible();
  await expect(today.getByRole("button")).toHaveCount(0);
  await expectNoA11yViolations(page);
  await page.goto("/expenses");
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add expense" })).toHaveCount(0);
  await expectNoA11yViolations(page);
});
