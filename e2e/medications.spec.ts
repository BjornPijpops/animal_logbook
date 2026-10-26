import { expect, test } from "./fixtures";
import { backdateSchedules, householdTimezone, runWorkerOnce } from "./db";
import { expectNoA11yViolations, signUpAndVerify } from "./helpers";
import { z } from "zod";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const searchSchema = z.object({
  messages: z.array(z.object({ Subject: z.string() })),
});

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

test("medication: schedule, due dose, log it, adherence and reminder email", async ({
  page,
  request,
}) => {
  const email = await signUpAndVerify(page, request, "meds");
  const timezone = await householdTimezone(email);

  await page.goto("/animals/new");
  await page.getByLabel("Name").fill("Rex");
  await page.getByLabel("Species").selectOption("dog");
  await page.getByRole("button", { name: "Save animal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rex" })).toBeVisible();

  await page.goto("/medications");
  await expect(page.getByText("No doses are due right now.")).toBeVisible();
  await expect(page.getByText("Reminders are a convenience")).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: "Add medication" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New medication" })).toBeVisible();
  await expectNoA11yViolations(page);

  // A time half an hour ago, starting yesterday, so the dose is due whatever the clock says.
  const slot = localParts(new Date(Date.now() - 30 * 60_000), timezone);
  const yesterday = localParts(new Date(Date.now() - 24 * 3_600_000), timezone).date;
  await page.getByLabel("Animal").selectOption({ label: "Rex" });
  await page.getByLabel("Name").fill("Amoxicillin");
  await page.getByLabel("Dosage").fill("1 tablet");
  await page.getByLabel("Start date").fill(yesterday);
  await page.getByLabel("Time 1").fill(slot.time);
  await page.getByRole("button", { name: "Add medication" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Amoxicillin" })).toBeVisible();
  await expectNoA11yViolations(page);

  await backdateSchedules("Amoxicillin", 2);
  runWorkerOnce();
  await expect
    .poll(
      async () => {
        const response = await request.get(`${MAILPIT}/api/v1/search`, {
          params: { query: `to:${email} subject:"Reminder for Rex"` },
        });
        return searchSchema.parse(await response.json()).messages.length;
      },
      { timeout: 20_000 },
    )
    .toBe(1);
  // A second pass must not send the same reminder again.
  runWorkerOnce();
  const again = await request.get(`${MAILPIT}/api/v1/search`, {
    params: { query: `to:${email} subject:"Reminder for Rex"` },
  });
  expect(searchSchema.parse(await again.json()).messages).toHaveLength(1);

  await page.goto("/medications");
  await expect(page.getByRole("heading", { name: "Due now" })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: /^Given: Amoxicillin/ }).click();
  await expect(page.getByText("No doses are due right now.")).toBeVisible();

  await page.getByRole("link", { name: "Amoxicillin" }).click();
  await expect(page.getByText(/1 given, 0 skipped, 0 missed/)).toBeVisible();
  await expect(page.getByText(/Given · by E2E Owner/)).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/settings/notifications");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/medications");
  await page.getByRole("link", { name: "Amoxicillin" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete medication" }).click();
  await expect(page.getByRole("heading", { name: "Recently deleted" })).toBeVisible();
  await page.getByRole("button", { name: /^Restore: Amoxicillin/ }).click();
  await expect(page.getByRole("link", { name: "Amoxicillin" })).toBeVisible();
});
