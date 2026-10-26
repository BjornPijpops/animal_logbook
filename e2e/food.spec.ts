import { expect, test } from "./fixtures";
import { expectNoA11yViolations, signUpAndVerify } from "./helpers";

test("food: overlapping plans, meals, chart markers, investigation, purchase once, delete and restore", async ({
  page,
  request,
}) => {
  test.slow();
  await signUpAndVerify(page, request, "food");

  await page.goto("/animals/new");
  await page.getByLabel("Name").fill("Rex");
  await page.getByLabel("Species").selectOption("dog");
  await page.getByRole("button", { name: "Save animal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rex" })).toBeVisible();

  await page.getByLabel("Weight", { exact: true }).fill("12.5");
  await page.getByLabel("Date measured").fill("2025-01-05");
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByRole("cell", { name: /12\.5/ })).toBeVisible();
  await page.getByLabel("Weight", { exact: true }).fill("13");
  await page.getByLabel("Date measured").fill("2025-03-05");
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByRole("cell", { name: /13 / })).toBeVisible();

  await page.getByRole("link", { name: "Add health record" }).click();
  await page.getByLabel("Type", { exact: true }).selectOption({ label: "Allergy" });
  await page.getByLabel("Allergen").fill("Chicken");
  await page.getByRole("button", { name: "Add record" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Chicken" })).toBeVisible();

  await page.goto("/food");
  await expect(page.getByRole("heading", { level: 1, name: "Food" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/food/new");
  await expect(page.getByRole("heading", { level: 1, name: "New food plan" })).toBeVisible();
  await page.getByLabel("Animal").selectOption({ label: "Rex" });
  await page.getByLabel("Brand").fill("Acme");
  await page.getByLabel("Flavor").fill("Chicken");
  await page.getByLabel("Start date").fill("2025-01-10");
  await page.getByLabel("End date").fill("2025-02-20");
  await page.getByRole("button", { name: "Add meal" }).click();
  await page.getByLabel("Meal 1 time").fill("08:00");
  await page.getByLabel(/Meal 1 amount/).fill("60");
  await page.getByRole("button", { name: "Add meal" }).click();
  await page.getByLabel("Meal 2 time").fill("18:00");
  await page.getByLabel(/Meal 2 amount/).fill("40.5");
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Create food plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Acme Chicken" })).toBeVisible();
  await expect(page.getByTestId("daily-quantity")).toContainText("100.5 g");
  await expectNoA11yViolations(page);

  await page.goto("/food/new");
  await page.getByLabel("Animal").selectOption({ label: "Rex" });
  await page.getByLabel("Brand").fill("Zed");
  await page.getByLabel("Type", { exact: true }).selectOption({ label: "Supplement" });
  await page.getByLabel("Start date").fill("2025-02-01");
  await page.getByLabel("Note on starting this food").fill("Added gradually");
  await page.getByRole("button", { name: "Create food plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Zed" })).toBeVisible();

  await page.goto("/food");
  await expect(page.getByRole("link", { name: /Acme Chicken/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Zed/ })).toBeVisible();

  await page.getByRole("link", { name: "Diet-change history" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Diet-change history" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Added gradually" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/animals");
  await page.getByRole("link", { name: /Rex/ }).first().click();
  await expect(page.getByRole("heading", { level: 3, name: "Food changes" })).toBeVisible();
  const markers = page.getByRole("table", { name: /Food plan starts and ends/ });
  await expect(markers.getByRole("row")).toHaveCount(4);
  await expect(markers).toContainText("Started: Acme Chicken");
  await expect(markers).toContainText("Ended: Acme Chicken");
  await expectNoA11yViolations(page);

  await page.goto("/food/investigation");
  await expect(
    page.getByRole("heading", { level: 1, name: "Allergy investigation" }),
  ).toBeVisible();
  await expect(
    page.getByText("a record of events, not a diagnosis", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Allergy record" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Food started" }).first()).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/food");
  await page.getByRole("link", { name: /Acme Chicken/ }).click();
  await page.getByLabel("Amount", { exact: true }).fill("32.40");
  await page.getByRole("button", { name: "Log a purchase" }).click();
  await expect(page.getByText("Purchase logged.")).toBeVisible();

  await page.goto("/expenses");
  await expect(page.getByRole("link", { name: "Acme Chicken" })).toHaveCount(1);
  await expect(page.getByRole("row", { name: /Total/ })).toContainText("32.40");
  await page.getByRole("link", { name: "Acme Chicken" }).click();
  await page.getByRole("link", { name: "Open the linked food plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Acme Chicken" })).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete food plan" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Food" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Acme Chicken/ })).toHaveCount(0);
  await page.goto("/expenses");
  await expect(page.getByRole("row", { name: /Total/ })).toContainText("32.40");

  await page.goto("/food");
  await page.getByRole("button", { name: /Restore: Acme/ }).click();
  await expect(page.getByRole("link", { name: /Acme Chicken/ })).toBeVisible();
  await expectNoA11yViolations(page);
});
