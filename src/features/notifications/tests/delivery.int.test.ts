import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { notificationDeliveries, pushSubscriptions, reminders } from "@/db/schema";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import {
  createEmailChannel,
  createPushChannel,
  type NotificationChannel,
  type PushSender,
} from "../server/channels";
import { runDelivery, type DeliveryDeps } from "../server/delivery";
import { createPreferencesRepository } from "../server/preferences.repository";
import { createPushRepository, createPushStore } from "../server/push.repository";

const db = setupTestDatabase();
const NOW = new Date("2025-03-10T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

type Sent = { to: string; subject: string; text: string };

function harness(
  options: { emailFails?: () => boolean; pushStatus?: (endpoint: string) => number } = {},
) {
  const emails: Sent[] = [];
  const pushes: { endpoint: string; payload: string }[] = [];
  const email = createEmailChannel({
    async send(message) {
      if (options.emailFails?.()) throw new Error("smtp down");
      emails.push(message);
    },
  });
  const sender: PushSender = {
    async send(subscription, payload) {
      pushes.push({ endpoint: subscription.endpoint, payload });
      return { status: options.pushStatus?.(subscription.endpoint) ?? 201 };
    },
  };
  const channels: Record<string, NotificationChannel> = {
    email,
    push: createPushChannel(createPushStore(db), sender, { allowLocalEndpoints: true }),
  };
  const deps = (now: Date = NOW): DeliveryDeps => ({
    db,
    channels,
    appUrl: "http://app.test",
    staleWindowHours: 24,
    now: () => now,
  });
  return { emails, pushes, deps };
}

async function setup() {
  const w = await seedTwoHouseholds(db);
  const viewer = await createUser(db, { name: "Viewer" });
  await addMember(db, w.householdA.id, viewer.id, "viewer");
  const animalId = await seedAnimal(db, ctxFor(w.ownerA, w.householdA, "owner"), "Milo");
  const addReminder = async (
    dueAt: Date,
    title = "Amoxicillin 250mg",
    householdId = w.householdA.id,
  ) => {
    const [row] = await db
      .insert(reminders)
      .values({
        householdId,
        sourceType: "medication_dose",
        sourceId: randomUUID(),
        animalId: householdId === w.householdA.id ? animalId : null,
        title,
        dueAt,
      })
      .returning();
    if (!row) throw new Error("reminder insert failed");
    return row;
  };
  return { w, viewer, animalId, addReminder };
}

const reminderRow = async (id: string) =>
  (await db.select().from(reminders).where(eq(reminders.id, id)))[0];
const deliveriesOf = (reminderId: string) =>
  db.select().from(notificationDeliveries).where(eq(notificationDeliveries.reminderId, reminderId));

describe("reminder delivery", () => {
  it("emails every household member once, and a second run sends nothing", async () => {
    const { w, viewer, addReminder } = await setup();
    const reminder = await addReminder(hoursAgo(1));
    const h = harness();

    await runDelivery(h.deps());
    const mine = h.emails.filter((m) => m.text.includes("app.test"));
    const recipients = mine.map((m) => m.to);
    expect(recipients).toContain(w.ownerA.email);
    expect(recipients).toContain(viewer.email);
    expect(recipients).not.toContain(w.ownerB.email);

    const before = h.emails.length;
    const second = await runDelivery(h.deps());
    expect(second.sent).toBe(0);
    expect(h.emails.length).toBe(before);
    expect((await reminderRow(reminder.id))?.doneAt).not.toBeNull();
  });

  it("sends exactly once when two workers run at the same time", async () => {
    const { w, addReminder } = await setup();
    const reminder = await addReminder(hoursAgo(1));
    const h = harness();
    await Promise.all([runDelivery(h.deps()), runDelivery(h.deps()), runDelivery(h.deps())]);
    const toOwner = h.emails.filter((m) => m.to === w.ownerA.email);
    expect(toOwner).toHaveLength(1);
    const rows = await deliveriesOf(reminder.id);
    expect(rows.every((r) => r.status === "sent" && r.attempts === 1)).toBe(true);
  });

  it("keeps the text free of titles and medical specifics", async () => {
    const { w, addReminder } = await setup();
    await addReminder(hoursAgo(1), "Insulin 4 units for diabetes");
    const h = harness();
    await runDelivery(h.deps());
    const mail = h.emails.find((m) => m.to === w.ownerA.email);
    expect(mail?.subject).toBe("Reminder for Milo");
    expect(`${mail?.subject}${mail?.text}`).not.toMatch(/insulin|diabetes|units/i);
    expect(mail?.text).toContain("not medical advice");
  });

  it("marks reminders older than the stale window as expired and never sends them", async () => {
    const { w, addReminder } = await setup();
    const stale = await addReminder(hoursAgo(25));
    const fresh = await addReminder(hoursAgo(23));
    const h = harness();
    const report = await runDelivery(h.deps());
    expect(report.expired).toBeGreaterThanOrEqual(1);
    expect((await reminderRow(stale.id))?.expiredAt).not.toBeNull();
    expect(await deliveriesOf(stale.id)).toHaveLength(0);
    expect((await reminderRow(fresh.id))?.expiredAt).toBeNull();
    expect(h.emails.filter((m) => m.to === w.ownerA.email)).toHaveLength(1);
  });

  it("applies the stale rule to follow-up and vaccination reminders too", async () => {
    const { w } = await setup();
    const rows = await db
      .insert(reminders)
      .values(
        (["follow_up", "vaccination_due"] as const).map((sourceType) => ({
          householdId: w.householdA.id,
          sourceType,
          sourceId: randomUUID(),
          title: "Old",
          dueAt: hoursAgo(72),
        })),
      )
      .returning();
    const h = harness();
    await runDelivery(h.deps());
    for (const row of rows) {
      expect((await reminderRow(row.id))?.expiredAt).not.toBeNull();
      expect(await deliveriesOf(row.id)).toHaveLength(0);
    }
  });

  it("does not deliver reminders that are not due yet", async () => {
    const { addReminder } = await setup();
    const future = await addReminder(new Date(NOW.getTime() + 3_600_000));
    await runDelivery(harness().deps());
    expect((await reminderRow(future.id))?.claimedAt).toBeNull();
  });

  it("retries with backoff, then gives up after the maximum attempts", async () => {
    const { w, addReminder } = await setup();
    const reminder = await addReminder(hoursAgo(1));
    let failing = true;
    const h = harness({ emailFails: () => failing });

    const first = await runDelivery(h.deps());
    expect(first.retried).toBeGreaterThanOrEqual(2);
    let rows = await deliveriesOf(reminder.id);
    const owner = rows.find((r) => r.userId === w.ownerA.id);
    expect(owner?.status).toBe("pending");
    expect(owner?.attempts).toBe(1);
    expect(owner?.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000);

    // Too early: nothing is retried.
    expect((await runDelivery(h.deps(new Date(NOW.getTime() + 30_000)))).retried).toBe(0);

    failing = false;
    const later = new Date(NOW.getTime() + 2 * 60_000);
    await runDelivery(h.deps(later));
    rows = await deliveriesOf(reminder.id);
    expect(rows.find((r) => r.userId === w.ownerA.id)).toMatchObject({
      status: "sent",
      attempts: 2,
    });
    expect(h.emails.filter((m) => m.to === w.ownerA.email)).toHaveLength(1);
  });

  it("fails a delivery for good after five failed attempts", async () => {
    const { w, addReminder } = await setup();
    const reminder = await addReminder(hoursAgo(1));
    const h = harness({ emailFails: () => true });
    let clock = NOW;
    for (let i = 0; i < 6; i += 1) {
      await runDelivery(h.deps(clock));
      clock = new Date(clock.getTime() + 3 * 3_600_000);
    }
    const owner = (await deliveriesOf(reminder.id)).find((r) => r.userId === w.ownerA.id);
    expect(owner?.status).toBe("failed");
    expect(owner?.attempts).toBe(5);
    expect(owner?.lastError).toBe("smtp down");
  });

  it("skips channels a user turned off", async () => {
    const { w, addReminder } = await setup();
    await createPreferencesRepository(db, w.ownerA.id).set("email", false);
    const reminder = await addReminder(hoursAgo(1));
    const h = harness();
    await runDelivery(h.deps());
    expect(h.emails.filter((m) => m.to === w.ownerA.email)).toHaveLength(0);
    expect((await deliveriesOf(reminder.id)).some((r) => r.userId === w.ownerA.id)).toBe(false);
  });

  it("does not send a reminder that was cancelled while queued", async () => {
    const { w, addReminder } = await setup();
    const reminder = await addReminder(hoursAgo(1));
    const failing = { value: true };
    const h = harness({ emailFails: () => failing.value });
    await runDelivery(h.deps());
    await db.update(reminders).set({ cancelledAt: NOW }).where(eq(reminders.id, reminder.id));
    failing.value = false;
    await runDelivery(h.deps(new Date(NOW.getTime() + 2 * 60_000)));
    expect(h.emails.filter((m) => m.to === w.ownerA.email)).toHaveLength(0);
  });

  describe("web push", () => {
    const subscribe = (userId: string, endpoint: string) =>
      createPushRepository(db, userId).upsert({
        endpoint,
        p256dh: "k",
        auth: "a",
        userAgent: null,
      });

    it("delivers only to the recipient's own subscriptions", async () => {
      const { w, viewer, addReminder } = await setup();
      const ownerEndpoint = `https://push.example.test/${randomUUID()}`;
      const viewerEndpoint = `https://push.example.test/${randomUUID()}`;
      const strangerEndpoint = `https://push.example.test/${randomUUID()}`;
      await subscribe(w.ownerA.id, ownerEndpoint);
      await subscribe(viewer.id, viewerEndpoint);
      await subscribe(w.ownerB.id, strangerEndpoint);
      await addReminder(hoursAgo(1));
      const h = harness();
      await runDelivery(h.deps());
      const endpoints = h.pushes.map((p) => p.endpoint);
      expect(endpoints).toContain(ownerEndpoint);
      expect(endpoints).toContain(viewerEndpoint);
      expect(endpoints).not.toContain(strangerEndpoint);
      expect(await createPushRepository(db, viewer.id).list()).toHaveLength(1);
      const payload = h.pushes.find((p) => p.endpoint === ownerEndpoint)?.payload ?? "";
      expect(payload).not.toMatch(/amoxicillin/i);
    });

    it("removes a subscription the push service reports as gone (404 or 410)", async () => {
      const { w, addReminder } = await setup();
      const gone = `https://push.example.test/${randomUUID()}`;
      const alive = `https://push.example.test/${randomUUID()}`;
      await subscribe(w.ownerA.id, gone);
      await subscribe(w.ownerA.id, alive);
      await addReminder(hoursAgo(1));
      await runDelivery(harness({ pushStatus: (e) => (e === gone ? 410 : 201) }).deps());
      const left = await createPushRepository(db, w.ownerA.id).list();
      expect(left.map((s) => s.endpoint)).toEqual([alive]);
    });

    it("keeps the subscription and retries on a server error", async () => {
      const { w, addReminder } = await setup();
      const endpoint = `https://push.example.test/${randomUUID()}`;
      await subscribe(w.ownerA.id, endpoint);
      const reminder = await addReminder(hoursAgo(1));
      await runDelivery(harness({ pushStatus: () => 503 }).deps());
      const push = (await deliveriesOf(reminder.id)).find(
        (r) => r.userId === w.ownerA.id && r.channel === "push",
      );
      expect(push?.status).toBe("pending");
      const rows = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
      expect(rows).toHaveLength(1);
    });
  });
});
