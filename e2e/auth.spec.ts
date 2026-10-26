import { expect, test } from "./fixtures";
import { expectNoA11yViolations } from "./helpers";
import { z } from "zod";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const searchSchema = z.object({ messages: z.array(z.object({ ID: z.string() })) });
const messageSchema = z.object({ Text: z.string() });
const PASSWORD = "correct-horse-battery";

async function waitForLink(request: import("@playwright/test").APIRequestContext, email: string) {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT}/api/v1/search`, {
          params: { query: `to:${email}` },
        });
        const { messages } = searchSchema.parse(await search.json());
        const first = messages[0];
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
  if (!link) throw new Error("No link found in email");
  return link;
}

test.describe("public auth pages are accessible", () => {
  for (const path of ["/sign-in", "/sign-up", "/forgot-password"]) {
    test(`axe: ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoA11yViolations(page);
    });
  }
});

test("anonymous visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/household");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fhousehold/);
});

test("sign up, verify email, sign out and sign in again", async ({ page, request }) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto(await waitForLink(request, email));
  await expect(page.getByRole("heading", { name: /Hello, E2E Tester/ })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Hello, E2E Tester/ })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toContainText(
    "Email or password is incorrect.",
  );
});

test("repeated sign-in attempts from one client are rate limited", async ({ request }) => {
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) {
    const response = await request.post("/api/auth/sign-in/email", {
      data: { email: `nobody-${i}@example.test`, password: PASSWORD },
      headers: { origin: "http://localhost:3000" },
    });
    statuses.push(response.status());
  }
  expect(statuses.at(-1)).toBe(429);
  expect(statuses.slice(0, 3)).not.toContain(429);
});

test("sign-in attempts for one account are limited even from many addresses", async ({
  request,
}) => {
  const email = `target-${Date.now()}@example.test`;
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) {
    const response = await request.post("/api/auth/sign-in/email", {
      data: { email, password: PASSWORD },
      headers: { origin: "http://localhost:3000", "x-forwarded-for": `10.9.${i}.1` },
    });
    statuses.push(response.status());
  }
  expect(statuses.slice(0, 10)).not.toContain(429);
  expect(statuses.at(-1)).toBe(429);
});
