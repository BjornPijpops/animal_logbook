"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  setChannelPreferenceAction,
  subscribePushAction,
  unsubscribePushAction,
} from "../server/actions";

type Props = {
  preferences: { email: boolean; push: boolean };
  pushConfigured: boolean;
  vapidPublicKey: string | null;
  deviceCount: number;
};

const subscribeNever = () => () => undefined;
const detectPushSupport = () => "serviceWorker" in navigator && "PushManager" in window;

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function NotificationSettings({
  preferences,
  pushConfigured,
  vapidPublicKey,
  deviceCount,
}: Props) {
  const t = useTranslations("notifications");
  const [prefs, setPrefs] = useState(preferences);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The server cannot know about the browser, so render as unsupported first and then switch.
  const pushSupported = useSyncExternalStore(subscribeNever, detectPushSupport, () => false);

  useEffect(() => {
    if (!pushSupported) return;
    void navigator.serviceWorker.getRegistration().then(async (registration) => {
      setSubscribed(Boolean(await registration?.pushManager.getSubscription()));
    });
  }, [pushSupported]);

  function toggle(channel: "email" | "push", enabled: boolean) {
    setPrefs((current) => ({ ...current, [channel]: enabled }));
    startTransition(async () => {
      const result = await setChannelPreferenceAction({ channel, enabled });
      if (!result.ok) {
        setPrefs((current) => ({ ...current, [channel]: !enabled }));
        setError(t("errors.other"));
      }
    });
  }

  function enableDevice() {
    setError(null);
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration || !vapidPublicKey) return setError(t("errors.unavailable"));
        if ((await Notification.requestPermission()) !== "granted")
          return setError(t("errors.denied"));
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(vapidPublicKey),
        });
        const result = await subscribePushAction(subscription.toJSON());
        if (result.ok) setSubscribed(true);
        else setError(t("errors.other"));
      } catch {
        setError(t("errors.other"));
      }
    });
  }

  function disableDevice() {
    setError(null);
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await unsubscribePushAction({ endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        setSubscribed(false);
      } catch {
        setError(t("errors.other"));
      }
    });
  }

  return (
    <div className="space-y-6">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">{t("channels")}</legend>
        {(["email", "push"] as const).map((channel) => (
          <label key={channel} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={prefs[channel]}
              disabled={pending}
              onChange={(event) => toggle(channel, event.target.checked)}
            />
            <span>{t(`channel.${channel}`)}</span>
          </label>
        ))}
      </fieldset>

      <section aria-labelledby="push-heading" className="space-y-3">
        <h2 id="push-heading" className="text-lg font-semibold">
          {t("pushTitle")}
        </h2>
        {!pushConfigured ? (
          <p className="text-muted-foreground text-sm">{t("pushNotConfigured")}</p>
        ) : !pushSupported ? (
          <p className="text-muted-foreground text-sm">{t("pushUnsupported")}</p>
        ) : (
          <>
            <p className="text-sm">{t("devices", { count: deviceCount })}</p>
            {subscribed ? (
              <Button variant="secondary" disabled={pending} onClick={disableDevice}>
                {t("disableDevice")}
              </Button>
            ) : (
              <Button disabled={pending || subscribed === null} onClick={enableDevice}>
                {t("enableDevice")}
              </Button>
            )}
          </>
        )}
      </section>
      <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>
    </div>
  );
}
