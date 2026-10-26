import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createUser, setupTestDatabase } from "@/test/db";
import { isAllowedPushEndpoint } from "../server/channels";
import {
  getNotificationSettings,
  setChannelPreference,
  subscribePush,
  unsubscribePush,
  type NotificationDeps,
} from "../server/service";

const db = setupTestDatabase();
const deps: NotificationDeps = { db, pushConfigured: true, allowLocalPushEndpoints: false };
const subscription = (endpoint = `https://fcm.example.com/send/${randomUUID()}`) => ({
  endpoint,
  keys: { p256dh: "BKey", auth: "authSecret" },
});

describe("push endpoint guard", () => {
  it.each([
    "http://push.example.com/x",
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://[::1]/x",
    "https://10.0.0.5/x",
    "https://intranet/x",
    "https://printer.local/x",
    "https://push.example.com:8443/x",
    "https://user:pw@push.example.com/x",
    "not a url",
  ])("rejects %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it("accepts a public https push service", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
  });
});

describe("notification settings", () => {
  it("has every channel on by default and remembers changes per user", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    expect((await getNotificationSettings(deps, a.id)).preferences).toEqual({
      email: true,
      push: true,
    });
    await setChannelPreference(deps, a.id, { channel: "email", enabled: false });
    expect((await getNotificationSettings(deps, a.id)).preferences.email).toBe(false);
    expect((await getNotificationSettings(deps, b.id)).preferences.email).toBe(true);
  });

  it("rejects unknown channels", async () => {
    const a = await createUser(db);
    const result = await setChannelPreference(deps, a.id, { channel: "sms", enabled: true });
    expect(result.ok).toBe(false);
  });
});

describe("push subscriptions", () => {
  it("stores one per device and lists only the caller's own", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    expect((await subscribePush(deps, a.id, subscription(), "UA")).ok).toBe(true);
    expect((await subscribePush(deps, a.id, subscription(), null)).ok).toBe(true);
    await subscribePush(deps, b.id, subscription(), null);
    expect((await getNotificationSettings(deps, a.id)).endpoints).toHaveLength(2);
    expect((await getNotificationSettings(deps, b.id)).endpoints).toHaveLength(1);
  });

  it("is idempotent for the same device", async () => {
    const a = await createUser(db);
    const sub = subscription();
    await subscribePush(deps, a.id, sub, null);
    await subscribePush(deps, a.id, sub, null);
    expect((await getNotificationSettings(deps, a.id)).endpoints).toEqual([sub.endpoint]);
  });

  it("refuses internal endpoints and an unconfigured server", async () => {
    const a = await createUser(db);
    const internal = await subscribePush(deps, a.id, subscription("https://127.0.0.1/x"), null);
    expect(internal.ok).toBe(false);
    const off = await subscribePush({ ...deps, pushConfigured: false }, a.id, subscription(), null);
    expect(off.ok).toBe(false);
  });

  it("unsubscribes only the caller's own device", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    const sub = subscription();
    await subscribePush(deps, a.id, sub, null);
    const foreign = await unsubscribePush(deps, b.id, { endpoint: sub.endpoint });
    expect(foreign.ok).toBe(false);
    expect((await getNotificationSettings(deps, a.id)).endpoints).toHaveLength(1);
    expect((await unsubscribePush(deps, a.id, { endpoint: sub.endpoint })).ok).toBe(true);
    expect((await getNotificationSettings(deps, a.id)).endpoints).toHaveLength(0);
  });
});
