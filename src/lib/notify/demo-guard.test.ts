import { describe, expect, it, vi } from "vitest";
import { createEmailChannel, createPushChannel } from "@/features/notifications/worker";
import { isDemoRecipient } from "./demo-guard";

const message = { title: "t", body: "b", url: "https://example.test" };
const demo = { userId: "u", email: "demo-owner@example.test", name: "Demo" };

describe("demo delivery guard", () => {
  it("matches only demo addresses on the reserved domain", () => {
    expect(isDemoRecipient("demo-owner@example.test")).toBe(true);
    expect(isDemoRecipient(" Demo-Viewer@Example.Test ")).toBe(true);
    expect(isDemoRecipient("alice@example.test")).toBe(false);
    expect(isDemoRecipient("demo-owner@example.com")).toBe(false);
    expect(isDemoRecipient("x-demo-owner@example.test")).toBe(false);
  });

  it("never calls the mailer, push store or push sender for a demo recipient", async () => {
    const mailer = { send: vi.fn() };
    const store = { list: vi.fn(async () => []), remove: vi.fn() };
    const sender = { send: vi.fn(async () => ({ status: 201 })) };
    const email = await createEmailChannel(mailer).send(demo, message);
    const push = await createPushChannel(store, sender).send(demo, message);
    expect(email).toMatchObject({ ok: false, retryable: false });
    expect(push).toMatchObject({ ok: false, retryable: false });
    expect(mailer.send).not.toHaveBeenCalled();
    expect(store.list).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("still delivers to everyone else", async () => {
    const mailer = { send: vi.fn(async () => undefined) };
    const result = await createEmailChannel(mailer).send(
      { userId: "u2", email: "alice@example.test", name: "Alice" },
      message,
    );
    expect(result).toEqual({ ok: true });
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });
});
