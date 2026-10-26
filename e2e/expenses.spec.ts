import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { expectNoA11yViolations, pdfBytes, signUpAndVerify } from "./helpers";

test("expenses: manual entry with receipt, views, appointment cost once, delete and restore, CSV", async ({
  page,
  request,
}) => {
  test.slow();
  await signUpAndVerify(page, request, "spend");

  await page.goto("/animals/new");
  await page.getByLabel("Name").fill("Rex");
  await page.getByLabel("Species").selectOption("dog");
  await page.getByRole("button", { name: "Save animal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rex" })).toBeVisible();

  await page.goto("/appointments/new");
  await page.getByLabel("Title").fill("Vet visit");
  await page.getByLabel("Animal").selectOption({ label: "Rex" });
  await page.getByLabel("Cost").fill("45.50");
  await page.getByRole("button", { name: "Add appointment" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vet visit" })).toBeVisible();

  await page.goto("/expenses/new");
  await expect(page.getByRole("heading", { level: 1, name: "New expense" })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByLabel("Description").fill("Kibble bag");
  await page.getByLabel("Category").selectOption({ label: "Food" });
  await page.getByLabel("Amount").fill("20");
  await page.getByLabel("Animal").selectOption({ label: "Rex" });
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Kibble bag" })).toBeVisible();

  await page.getByLabel("Add files").setInputFiles({
    name: "receipt.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes("receipt"),
  });
  await expect(page.getByRole("link", { name: "Download receipt.pdf" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/expenses");
  await expect(page.getByRole("heading", { level: 1, name: "Expenses" })).toBeVisible();
  await expectNoA11yViolations(page);
  const total = page.getByRole("row", { name: /Total/ });
  await expect(total).toContainText("65.50");
  await expect(page.getByRole("link", { name: "Vet visit" })).toHaveCount(1);

  await page.getByRole("link", { name: "Annual", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Annual" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Total/ })).toContainText("65.50");
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "By category" }).click();
  await expect(page.getByRole("row", { name: /^Vet/ })).toContainText("45.50");
  await expect(page.getByRole("row", { name: /^Food/ })).toContainText("20.00");
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "Vet visit" }).click();
  await expect(page.getByRole("link", { name: "Edit in the appointment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete expense" })).toHaveCount(0);
  await expect(page.getByLabel("Amount")).toHaveCount(0);
  await expectNoA11yViolations(page);

  await page.goto("/expenses");
  await page.getByRole("link", { name: "Kibble bag" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete expense" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.getByRole("link", { name: "Kibble bag" })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Total/ })).toContainText("45.50");
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Restore: Kibble bag" }).click();
  await expect(page.getByRole("link", { name: "Kibble bag" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Total/ })).toContainText("65.50");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export CSV" }).click(),
  ]);
  const path = await download.path();
  const bytes = await readFile(path);
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const csv = bytes.toString("utf8");
  expect(csv).toContain("Kibble bag");
  expect(csv).toContain("Vet visit");
  expect(csv).toContain("45.50");
});
