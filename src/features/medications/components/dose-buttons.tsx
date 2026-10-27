"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { logDoseAction } from "../server/actions";
import { DOSE_LOGGED_EVENT } from "./dose-live-region";

function useDoseLogger(medicationId: string, announce?: (status: "given" | "skipped") => string) {
  const t = useTranslations("medications");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const log = (status: "given" | "skipped", scheduledAt?: string) =>
    startTransition(async () => {
      try {
        const result = await logDoseAction(medicationId, { status, scheduledAt });
        setError(
          result.ok ? null : t(`errors.${result.code === "forbidden" ? "forbidden" : "dose"}`),
        );
        if (result.ok && announce) {
          window.dispatchEvent(new CustomEvent(DOSE_LOGGED_EVENT, { detail: announce(status) }));
        }
      } catch {
        setError(t("errors.other"));
      }
    });
  return { error, pending, log };
}

type DoseProps = { medicationId: string; scheduledAt: string; label: string };

export function DoseButtons({ medicationId, scheduledAt, label }: DoseProps) {
  const t = useTranslations("medications");
  const { error, pending, log } = useDoseLogger(
    medicationId,
    (status) => `${t(status === "given" ? "given" : "skipped")}: ${label}`,
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled={pending}
        aria-label={`${t("given")}: ${label}`}
        onClick={() => log("given", scheduledAt)}
      >
        {t("given")}
      </Button>
      <Button
        variant="secondary"
        disabled={pending}
        aria-label={`${t("skipped")}: ${label}`}
        onClick={() => log("skipped", scheduledAt)}
      >
        {t("skipped")}
      </Button>
      {error ? (
        <span role="alert" className="text-destructive text-sm">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function AsNeededButton({ medicationId }: { medicationId: string }) {
  const t = useTranslations("medications");
  const { error, pending, log } = useDoseLogger(medicationId);
  return (
    <div className="space-y-2">
      <Button disabled={pending} onClick={() => log("given")}>
        {t("logNow")}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
