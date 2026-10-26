import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { z } from "zod";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const searchSchema = z.object({ messages: z.array(z.object({ ID: z.string() })) });
const messageSchema = z.object({ Text: z.string() });
const PASSWORD = "correct-horse-battery";

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function signUpAndVerify(page: Page, request: APIRequestContext) {
  const email = `animals-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Animal Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT}/api/v1/search`, {
          params: { query: `to:${email}` },
        });
        const first = searchSchema.parse(await search.json()).messages[0];
        if (!first) return false;
        const message = messageSchema.parse(
          await (await request.get(`${MAILPIT}/api/v1/message/${first.ID}`)).json(),
        );
        link = /https?:\/\/\S+/.exec(message.Text)?.[0];
        return Boolean(link);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  if (!link) throw new Error("No verification link found");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: /Hello, Animal Owner/ })).toBeVisible();
  return email;
}

test("create an animal, add a photo and a weight, open the emergency card", async ({
  page,
  request,
}) => {
  await signUpAndVerify(page, request);

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
