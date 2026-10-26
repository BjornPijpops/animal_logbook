"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui/alert";
import {
  clearOfflineEmergency,
  enableOfflineEmergency,
  isOfflineEmergencyEnabled,
  syncOfflineEmergency,
} from "@/lib/offline/emergency-cache";

const subscribeNever = () => () => undefined;

// Opt-in per device. The cache is filled from this signed-in page and cleared on sign-out.
export function OfflineEmergencyToggle() {
  const t = useTranslations("animals.offline");
  const stored = useSyncExternalStore(subscribeNever, isOfflineEmergencyEnabled, () => false);
  const [override, setOverride] = useState<boolean | null>(null);
  const enabled = override ?? stored;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!stored) return;
    void syncOfflineEmergency().catch(() => setFailed(true));
  }, [stored]);

  async function onChange(checked: boolean) {
    setFailed(false);
    if (!checked) {
      await clearOfflineEmergency();
      setOverride(false);
      return;
    }
    const synced = await enableOfflineEmergency().catch(() => false);
    setOverride(synced);
    setFailed(!synced);
  }

  return (
    <div className="space-y-2">
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-5"
          checked={enabled}
          aria-describedby="offline-hint"
          onChange={(event) => void onChange(event.currentTarget.checked)}
        />
        <span>
          <span className="font-medium">{t("label")}</span>
          <span id="offline-hint" className="text-muted-foreground block">
            {t("hint")}
          </span>
        </span>
      </label>
      {enabled ? <Alert tone="success">{t("enabled")}</Alert> : null}
      {failed ? <Alert tone="error">{t("failed")}</Alert> : null}
    </div>
  );
}
