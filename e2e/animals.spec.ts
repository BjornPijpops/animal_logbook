import { expect, test } from "./fixtures";
import sharp from "sharp";
import { expectNoA11yViolations, signUpAndVerify } from "./helpers";

test("create an animal, add a photo and a weight, open the emergency card", async ({
  page,
  request,
}) => {
  await signUpAndVerify(page, request, "animals");

  await page.goto("/animals");
  await expect(page.getByRole("heading", { name: "No animals yet" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "Add animal" }).click();
  await expect(page.getByRole("heading", { name: "Add an animal" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByLabel("Name").fill("Rex");
  await page.getByLabel("Species").selectOption("dog");
  await page.getByLabel("Breed").fill("Beagle");
  await page.getByLabel("Chip number").fill("985112345678901");
  await page.getByLabel("Allergies").fill("Chicken");
  await page.getByLabel("Emergency notes").fill("Vet: 555-0100");
  await page.getByRole("button", { name: "Save animal" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Rex" })).toBeVisible();

  const jpeg = await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .jpeg()
    .toBuffer();
  await page.getByLabel("Add a photo").setInputFiles({
    name: "rex.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg,
  });
  const photo = page.getByRole("img", { name: "Photo 1" });
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((img) => img instanceof HTMLImageElement && img.naturalWidth))
    .toBeGreaterThan(0);

  await page.getByLabel("Weight", { exact: true }).fill("12.5");
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByRole("cell", { name: /12\.5/ })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "Emergency card" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Emergency card" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Rex" })).toBeVisible();
  await expect(page.getByText("985112345678901")).toBeVisible();
  await expect(page.getByText("Chicken")).toBeVisible();
  await expectNoA11yViolations(page);

  const fileUrl = await page.getByRole("img", { name: "Photo of Rex" }).getAttribute("src");
  expect(fileUrl).toMatch(/^\/api\/files\//);

  const anonymous = await request.get(fileUrl ?? "", {
    maxRedirects: 0,
    headers: { cookie: "" },
  });
  expect([307, 401, 404]).toContain(anonymous.status());

  await page.goto("/animals");
  await page.getByRole("link", { name: /Rex/ }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete animal" }).click();
  await expect(page.getByRole("heading", { name: "No animals yet" })).toBeVisible();
});
