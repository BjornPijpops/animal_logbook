import { randomInt } from "node:crypto";
import { unzipSync } from "fflate";
import { z } from "zod";
import { withDb, runWorkerOnce } from "./db";
import { expect, test } from "./fixtures";
import { expectNoA11yViolations, PASSWORD, signUpAndVerify } from "./helpers";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const listSchema = z.object({ messages: z.array(z.object({ ID: z.string() })) });
const messageSchema = z.object({ Text: z.string() });

async function createAnimal(page: import("@playwright/test").Page, name: string) {
  await page.goto("/animals/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Species").selectOption("dog");
  await page.getByRole("button", { name: "Save animal" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function findInviteLink(
  request: import("@playwright/test").APIRequestContext,
  email: string,
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT}/api/v1/search`, {
          params: { query: `to:${email}` },
        });
        for (const { ID } of listSchema.parse(await search.json()).messages) {
          const message = messageSchema.parse(
            await (await request.get(`${MAILPIT}/api/v1/message/${ID}`)).json(),
          );
          link = /https?:\/\/\S+\/invite\/\S+/.exec(message.Text)?.[0];
          if (link) return true;
        }
        return false;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  if (!link) throw new Error("No invite link found");
  return link;
}

test("request a data export, have the worker build it and download it", async ({
  page,
  request,
  playwright,
  baseURL,
}) => {
  await signUpAndVerify(page, request, "export");
  await createAnimal(page, "Exported Rex");

  await page.goto("/settings/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy and data" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.locator("#export-password").fill("not-the-password");
  await page.getByRole("button", { name: "Request export" }).click();
  await expect(
    page.getByText("The password is wrong, or you are not allowed to do that."),
  ).toBeVisible();

  await page.locator("#export-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Request export" }).click();
  await expect(page.getByText("Done. Your request was received.")).toBeVisible();

  runWorkerOnce();
  await page.reload();
  const download = page.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible();
  const href = await download.getAttribute("href");
  if (!href) throw new Error("download link missing");

  const response = await page.context().request.get(href);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/zip");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  const zip = unzipSync(new Uint8Array(await response.body()));
  expect(Object.keys(zip)).toEqual(expect.arrayContaining(["README.txt", "data/animals.json"]));
  expect(Buffer.from(zip["data/animals.json"] ?? new Uint8Array()).toString("utf8")).toContain(
    "Exported Rex",
  );

  // Without the owner's session the link gives nothing.
  const anonymous = await playwright.request.newContext({ baseURL: baseURL ?? "" });
  const denied = await anonymous.get(href, { maxRedirects: 0 });
  expect(denied.status()).not.toBe(200);
  expect(denied.headers()["content-type"] ?? "").not.toContain("zip");
  await anonymous.dispose();
});

test("delete an account after re-confirming the password", async ({ page, request }) => {
  const email = await signUpAndVerify(page, request, "delete");
  await page.goto("/settings/privacy");

  await page.locator("#delete-account-password").fill("not-the-password");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(
    page.getByText("The password is wrong, or you are not allowed to do that."),
  ).toBeVisible();

  await page.locator("#delete-account-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  const remaining = await withDb((client) =>
    client.query("SELECT 1 FROM users WHERE email = $1", [email]),
  );
  expect(remaining.rowCount).toBe(0);
  await page.goto("/household");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a removed member loses access to the household", async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  await signUpAndVerify(page, request, "owner");
  await createAnimal(page, "Shared Rex");

  const inviteeEmail = `invitee-${Date.now()}-${randomInt(1e6)}@example.test`;
  await page.goto("/household");
  await page.getByLabel("Email").fill(inviteeEmail);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent.")).toBeVisible();

  const context = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    extraHTTPHeaders: {
      "x-forwarded-for": `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`,
    },
  });
  const guest = await context.newPage();
  await signUpAndVerify(guest, request, "invitee", inviteeEmail);
  await guest.goto(await findInviteLink(request, inviteeEmail));
  await guest.getByRole("button", { name: "Accept invitation" }).click();
  await guest.waitForURL("**/household");
  await guest.goto("/animals");
  await expect(guest.getByText("Shared Rex")).toBeVisible();

  await page.goto("/household");
  await page.getByRole("button", { name: /^Remove / }).click();
  await expect(page.getByText(inviteeEmail)).toHaveCount(0);

  await guest.goto("/animals");
  await expect(guest.getByText("Shared Rex")).toHaveCount(0);

  await page.goto("/settings/audit");
  await expect(
    page.getByRole("heading", { level: 1, name: "Household activity log" }),
  ).toBeVisible();
  await expect(page.getByText("Member removed")).toBeVisible();
  await expect(page.getByText("Invitation accepted")).toBeVisible();
  await expectNoA11yViolations(page);
  await context.close();
});
