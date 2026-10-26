import { expect, test } from "./fixtures";
import { expectNoA11yViolations, pdfBytes, signUpAndVerify } from "./helpers";

test("appointments and health records: cost, attachments, timeline, allergies, delete and restore", async ({
  page,
  request,
}) => {
  await signUpAndVerify(page, request, "care");

  await page.goto("/animals/new");
  await page.getByLabel("Name").fill("Rex");
  await page.getByLabel("Species").selectOption("dog");
  await page.getByRole("button", { name: "Save animal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rex" })).toBeVisible();

  await page.goto("/timeline");
  await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "Add appointment" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add an appointment" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByLabel("Title").fill("Annual check-up");
  await page.getByLabel("Animal").selectOption({ label: "Rex" });
  await page.getByLabel("Cost").fill("45.50");
  await page.getByRole("button", { name: "Add appointment" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Annual check-up" })).toBeVisible();
  await expect(page.getByText(/Cost: .*45\.50/)).toBeVisible();

  await page.getByLabel("Add files").setInputFiles([
    { name: "invoice.pdf", mimeType: "application/pdf", buffer: pdfBytes("invoice") },
    { name: "prescription.pdf", mimeType: "application/pdf", buffer: pdfBytes("rx") },
  ]);
  await expect(page.getByRole("link", { name: "Download invoice.pdf" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download prescription.pdf" })).toBeVisible();

  await page.getByLabel("Add files").setInputFiles({
    name: "evil.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html><script>alert(1)</script></html>"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "evil.pdf" })).toContainText(
    "Only PDF, JPEG, PNG and WebP",
  );
  await expect(page.getByRole("link", { name: /evil\.pdf/ })).toHaveCount(0);
  await expectNoA11yViolations(page);

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Remove prescription.pdf" }).click();
  await expect(page.getByRole("link", { name: "Download prescription.pdf" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download invoice.pdf" })).toBeVisible();

  await page.goto("/timeline");
  const item = page.getByRole("link", { name: /Annual check-up/ });
  await expect(item).toBeVisible();
  await expect(item).toContainText("45.50");
  await expectNoA11yViolations(page);

  await page.goto("/animals");
  await page.getByRole("link", { name: /Rex/ }).first().click();
  await page.getByRole("link", { name: "Add health record" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a health record" })).toBeVisible();
  await page.getByLabel("Type", { exact: true }).selectOption({ label: "Allergy" });
  await page.getByLabel("Allergen").fill("Chicken");
  await page.getByLabel("Severity").selectOption({ label: "Moderate" });
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Add record" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Chicken" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/animals");
  await page.getByRole("link", { name: /Rex/ }).first().click();
  await page.getByRole("link", { name: "Emergency card" }).click();
  await expect(page.getByText("Chicken")).toBeVisible();
  await expect(page.getByText("None recorded")).toHaveCount(0);
  await expectNoA11yViolations(page);

  await page.goto("/timeline");
  await page.getByLabel("Type", { exact: true }).selectOption({ label: "Allergy" });
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: /Chicken/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Annual check-up/ })).toHaveCount(0);

  await page.goto("/timeline");
  await page.getByRole("link", { name: /Annual check-up/ }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete appointment" }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(page.getByRole("link", { name: /Annual check-up/ })).toHaveCount(0);

  await page.getByLabel("Show deleted items").check();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: /Annual check-up/ })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Restore: Annual check-up" }).click();
  await expect(page.getByRole("link", { name: /Annual check-up/ })).toHaveCount(0);

  await page.goto("/timeline");
  await expect(page.getByRole("link", { name: /Annual check-up/ })).toBeVisible();
  await page.getByRole("link", { name: /Annual check-up/ }).click();
  await expect(page.getByRole("link", { name: "Download invoice.pdf" })).toBeVisible();
});
