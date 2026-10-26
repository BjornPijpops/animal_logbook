import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { expectNoA11yViolations, pdfBytes, signUpAndVerify } from "./helpers";

async function addDocument(page: Page, title: string, marker: string, type = "Vet invoice") {
  await page.goto("/documents/new");
  await page.getByLabel("File").setInputFiles({
    name: `${marker}.pdf`,
    mimeType: "application/pdf",
    buffer: pdfBytes(marker),
  });
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Type").selectOption({ label: type });
  await page.getByLabel("Notes").fill(`Notes for ${marker}`);
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

test("upload a document, find it by search, download it and delete it", async ({
  page,
  request,
}) => {
  await signUpAndVerify(page, request, "documents");

  await page.goto("/documents");
  await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "Add document" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add a document" })).toBeVisible();
  await expectNoA11yViolations(page);

  await addDocument(page, "Dental invoice", "dental");
  await expectNoA11yViolations(page);
  await addDocument(page, "Rabies passport", "rabies", "Passport");

  await page.goto("/documents");
  await expect(page.getByRole("link", { name: /Dental invoice/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Rabies passport/ })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("searchbox", { name: "Search" }).fill("dental");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: /Dental invoice/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Rabies passport/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Reset" }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole("link", { name: /Rabies passport/ })).toBeVisible();
  await page.getByLabel("Type", { exact: true }).selectOption({ label: "Passport" });
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name: /Rabies passport/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Dental invoice/ })).toHaveCount(0);

  await page.goto("/documents?q=dental");
  await page.getByRole("link", { name: /Dental invoice/ }).click();
  const link = page.getByRole("link", { name: /Download dental\.pdf/ });
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/api\/files\/[0-9a-f-]{36}\?download=1$/);

  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("dental.pdf");

  const response = await page.request.get(href ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-disposition"]).toMatch(/^attachment; filename="dental\.pdf"/);
  expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");

  const anonymous = await request.get(href ?? "", { maxRedirects: 0, headers: { cookie: "" } });
  expect([307, 401, 404]).toContain(anonymous.status());

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete document" }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole("link", { name: /Dental invoice/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Rabies passport/ })).toBeVisible();

  const gone = await page.request.get(href ?? "");
  expect(gone.status()).toBe(404);
});

test("spoofed and disallowed files are rejected in the UI", async ({ page, request }) => {
  await signUpAndVerify(page, request, "spoof");
  await page.goto("/documents/new");
  await page.getByLabel("Title").fill("Not really a PDF");

  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("File").setInputFiles({
    name: "fake.pdf",
    mimeType: "application/pdf",
    buffer: png,
  });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "does not match" })).toBeVisible();

  await page.getByLabel("File").setInputFiles({
    name: "evil.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html><script>alert(1)</script></html>"),
  });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Only PDF" })).toBeVisible();

  await page.getByLabel("File").setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
  });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Only PDF" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/documents");
  await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
});
