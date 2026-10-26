"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { deleteMedicationAction, restoreMedicationAction } from "../server/actions";

export function DeleteMedicationButton({ medicationId }: { medicationId: string }) {
  const t = useTranslations("medications");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      {failed ? <Alert tone="error">{t("errors.other")}</Alert> : null}
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("deleteConfirm"))) return;
          startTransition(async () => {
            const result = await deleteMedicationAction(medicationId);
            if (result && !result.ok) setFailed(true);
          });
        }}
      >
        {t("delete")}
      </Button>
    </div>
  );
}

export function RestoreMedicationButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("medications");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="secondary"
        disabled={pending}
        aria-label={`${t("restore")}: ${name}`}
        onClick={() =>
          startTransition(async () => {
            const result = await restoreMedicationAction(id);
            setFailed(!result.ok);
          })
        }
      >
        {t("restore")}
      </Button>
      {failed ? (
        <span role="alert" className="text-destructive text-sm">
          {t("errors.other")}
        </span>
      ) : null}
    </>
  );
}
