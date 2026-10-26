"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSessionUser } from "@/features/auth";
import type { AppErrorCode } from "@/lib/result";
import { getNotificationDeps } from "./deps";
import { setChannelPreference, subscribePush, unsubscribePush } from "./service";

export type NotificationActionResult = { ok: true } | { ok: false; code: AppErrorCode };

const done = (result: { ok: true } | { ok: false; error: { code: AppErrorCode } }) => {
  revalidatePath("/settings/notifications");
  return result.ok ? ({ ok: true } as const) : ({ ok: false, code: result.error.code } as const);
};

export async function setChannelPreferenceAction(
  input: unknown,
): Promise<NotificationActionResult> {
  const user = await requireSessionUser();
  return done(await setChannelPreference(getNotificationDeps(), user.id, input));
}

export async function subscribePushAction(input: unknown): Promise<NotificationActionResult> {
  const user = await requireSessionUser();
  const userAgent = (await headers()).get("user-agent");
  return done(await subscribePush(getNotificationDeps(), user.id, input, userAgent));
}

export async function unsubscribePushAction(input: unknown): Promise<NotificationActionResult> {
  const user = await requireSessionUser();
  return done(await unsubscribePush(getNotificationDeps(), user.id, input));
}
