import { isIP } from "node:net";
import webpush from "web-push";
import type { Env } from "@/lib/env";
import { DEMO_DELIVERY_DISABLED, isDemoRecipient } from "@/lib/notify/demo-guard";
import type { Mailer } from "@/lib/notify/email";

export const CHANNELS = ["email", "push"] as const;
export type ChannelName = (typeof CHANNELS)[number];

// Deliberately generic: the text may appear on a lock screen or in a mail preview, so it never
// carries a diagnosis, a medication name or any other medical detail.
export type NotificationMessage = { title: string; body: string; url: string };
export type Recipient = { userId: string; email: string; name: string };
export type SendOutcome = { ok: true } | { ok: false; retryable: boolean; error: string };

export interface NotificationChannel {
  readonly name: ChannelName;
  send(recipient: Recipient, message: NotificationMessage): Promise<SendOutcome>;
}

export function buildMessage(animalName: string, appUrl: string, animalId: string | null) {
  const base = appUrl.replace(/\/$/, "");
  return {
    title: `Reminder for ${animalName}`,
    body: "Something is due. Open Animal Logbook for details.",
    url: animalId ? `${base}/animals/${animalId}` : base,
  } satisfies NotificationMessage;
}

export const REMINDER_DISCLAIMER =
  "Reminders are a convenience, not medical advice or a delivery guarantee.";

export function createEmailChannel(mailer: Mailer): NotificationChannel {
  return {
    name: "email",
    async send(recipient, message) {
      if (isDemoRecipient(recipient.email)) {
        return { ok: false, retryable: false, error: DEMO_DELIVERY_DISABLED };
      }
      try {
        await mailer.send({
          to: recipient.email,
          subject: message.title,
          text: `${message.body}\n\n${message.url}\n\n${REMINDER_DISCLAIMER}\n`,
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, retryable: true, error: errorText(error) };
      }
    },
  };
}

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

// The seam between our code and the push service; tests plug in a fake that returns status codes.
export interface PushSender {
  send(
    subscription: Pick<PushSubscriptionRecord, "endpoint" | "p256dh" | "auth">,
    payload: string,
  ): Promise<{ status: number }>;
}

export interface PushStore {
  list(userId: string): Promise<PushSubscriptionRecord[]>;
  remove(id: string): Promise<void>;
}

// A subscription endpoint comes from the browser and we POST to it from the server, so only real
// push-service hosts are allowed: https, default port, a DNS name that is not local or internal.
export function isAllowedPushEndpoint(endpoint: string, allowLocal = false): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (allowLocal) return url.protocol === "https:" || url.protocol === "http:";
  const host = url.hostname.toLowerCase();
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    isIP(host.replace(/^\[|\]$/g, "")) === 0 &&
    host.includes(".") &&
    host !== "localhost" &&
    !/\.(local|localhost|internal|lan|home|corp|test)$/.test(host)
  );
}

export function createPushChannel(
  store: PushStore,
  sender: PushSender,
  options: { allowLocalEndpoints?: boolean } = {},
): NotificationChannel {
  return {
    name: "push",
    async send(recipient, message) {
      if (isDemoRecipient(recipient.email)) {
        return { ok: false, retryable: false, error: DEMO_DELIVERY_DISABLED };
      }
      const subscriptions = await store.list(recipient.userId);
      const payload = JSON.stringify(message);
      let delivered = 0;
      let retryable = false;
      let lastError = "no push subscription";
      for (const subscription of subscriptions) {
        if (!isAllowedPushEndpoint(subscription.endpoint, options.allowLocalEndpoints)) {
          await store.remove(subscription.id);
          continue;
        }
        try {
          const { status } = await sender.send(subscription, payload);
          if (status >= 200 && status < 300) delivered += 1;
          else if (status === 404 || status === 410) await store.remove(subscription.id);
          else {
            retryable = true;
            lastError = `push service returned ${status}`;
          }
        } catch (error) {
          retryable = true;
          lastError = errorText(error);
        }
      }
      if (delivered > 0) return { ok: true };
      return { ok: false, retryable, error: lastError };
    },
  };
}

// Keys come from the environment; without them push stays off instead of failing at send time.
export function createWebPushSender(
  env: Pick<Env, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT">,
): PushSender | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  return {
    async send(subscription, payload) {
      try {
        const response = await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { vapidDetails: vapid, TTL: 6 * 3600, urgency: "normal" },
        );
        return { status: response.statusCode };
      } catch (error) {
        if (error instanceof webpush.WebPushError) return { status: error.statusCode };
        throw error;
      }
    },
  };
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}
