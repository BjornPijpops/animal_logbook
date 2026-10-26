"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { restoreMedicalRecordAction } from "../server/actions";

export function RestoreMedicalRecordButton({ id, title }: { id: string; title: string }) {
  const t = useTranslations("medical");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="secondary"
        disabled={pending}
        aria-label={`${t("restore")}: ${title}`}
        onClick={() =>
          startTransition(async () => {
            const result = await restoreMedicalRecordAction(id);
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
