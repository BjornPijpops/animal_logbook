import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { z } from "zod";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const searchSchema = z.object({ messages: z.array(z.object({ ID: z.string() })) });
const messageSchema = z.object({ Text: z.string() });
export const PASSWORD = "correct-horse-battery";

export async function expectNoA11yViolations(page: Page) {
  // Next streams <head> metadata; scanning before it lands reports a false "missing title".
  await expect(page).toHaveTitle(/.+/);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

export async function signUpAndVerify(
  page: Page,
  request: APIRequestContext,
  prefix = "e2e",
  fixedEmail?: string,
) {
  const email =
    fixedEmail ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Owner");
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
        // An invitation addressed to the same email may already be in the inbox; skip it.
        for (const { ID } of searchSchema.parse(await search.json()).messages) {
          const message = messageSchema.parse(
            await (await request.get(`${MAILPIT}/api/v1/message/${ID}`)).json(),
          );
          const candidate = /https?:\/\/\S+/.exec(message.Text)?.[0];
          if (candidate && !candidate.includes("/invite/")) {
            link = candidate;
            break;
          }
        }
        return Boolean(link);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  if (!link) throw new Error("No verification link found");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: /Hello, E2E Owner/ })).toBeVisible();
  return email;
}

export function pdfBytes(marker: string): Buffer {
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<<>>\nendobj\n% ${marker}\ntrailer\n<<>>\n%%EOF\n`);
}
