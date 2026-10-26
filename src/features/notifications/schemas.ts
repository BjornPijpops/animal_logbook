import { z } from "zod";
import { CHANNELS } from "./server/channels";

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(256) }),
});

export const unsubscribeSchema = z.object({ endpoint: z.url().max(2048) });

export const preferenceSchema = z.object({
  channel: z.enum(CHANNELS),
  enabled: z.boolean(),
});
