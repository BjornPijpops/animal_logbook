import { expect, test } from "./fixtures";
import { backdateSchedules, seedDashboardData } from "./db";
import { expectNoA11yViolations, signUpAndVerify } from "./helpers";

test("dashboard: cards, animal overview and mobile navigation", async ({ page, request }) => {
  test.slow();
  const email = await signUpAndVerify(page, request, "dash");

  await expect(page.getByRole("heading", { level: 2, name: "Upcoming" })).toBeVisible();
  await expect(page.getByText("Nothing scheduled in the next 14 days.")).toBeVisible();
  await expect(page.getByText("No documents expiring soon.")).toBeVisible();
  await expect(page.getByText("No entered next-due dates have passed.")).toBeVisible();
  await expect(page.getByText("No expenses entered this month.")).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/animals/new");
  await page.getByLabel("Name").fill("Rex");
  await page.getByLabel("Species").selectOption("dog");
  await page.getByRole("button", { name: "Save animal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rex" })).toBeVisible();

  await page.goto("/medications/new");
  await page.getByLabel("Animal").selectOption({ label: "Rex" });
  await page.getByLabel("Name").fill("Amoxicillin");
  await page.getByLabel("Dosage").fill("1 tablet");
  await page
    .getByLabel("Start date")
    .fill(new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10));
  await page.getByLabel("Time 1").fill("00:00");
  await page.getByRole("button", { name: "Add medication" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Amoxicillin" })).toBeVisible();
  await backdateSchedules("Amoxicillin", 30);
  await seedDashboardData(email, "Rex");

  await page.goto("/");
  const upcoming = page.getByRole("region", { name: "Upcoming" });
  await expect(upcoming.getByRole("link", { name: "Spring trim" })).toBeVisible();
  await expect(upcoming.getByRole("link", { name: "Follow-up: Dental check" })).toBeVisible();
  const vaccinations = page.getByRole("region", { name: "Vaccination dates passed" });
  await expect(vaccinations.getByRole("link", { name: "Rabies booster" })).toBeVisible();
  await expect(vaccinations).toContainText("next due");
  const meds = page.getByRole("region", { name: "Medications" });
  await expect(meds.getByRole("link", { name: "Amoxicillin" }).first()).toBeVisible();
  await expect(meds).toContainText("Doses due today");
  const docs = page.getByRole("region", { name: "Documents expiring" });
  await expect(docs.getByRole("link", { name: "Pet insurance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View expenses" })).toBeVisible();
  await expect(page.getByText("No recent diet changes.")).toBeVisible();
  await expectNoA11yViolations(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expectNoA11yViolations(page);
  await expect(
    page.getByRole("complementary").getByRole("link", { name: "Expenses" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 412, height: 915 });

  await vaccinations.getByRole("link", { name: "Rabies booster" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rabies booster" })).toBeVisible();
  await page.goto("/animals");
  await page.getByRole("link", { name: "Rex" }).first().click();
  await expect(page.getByRole("heading", { level: 2, name: "Overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pet insurance" })).toBeVisible();
  await expectNoA11yViolations(page);

  // Mobile navigation: three destinations and a keyboard-operable "More" menu.
  const bar = page.getByRole("navigation", { name: "Main" });
  await expect(bar.getByRole("link")).toHaveCount(3);
  const more = bar.getByRole("button", { name: "More" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("navigation", { name: "More pages" });
  await expect(menu.getByRole("link")).toHaveCount(6);
  await expectNoA11yViolations(page);
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toBeFocused();

  await more.click();
  await menu.getByRole("link", { name: "Expenses" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toHaveAttribute("aria-current", "page");
  await expect(bar.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
  await bar.getByRole("link", { name: "Home" }).click();
  await expect(bar.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
});
