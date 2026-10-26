"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { deleteMedicalRecordAction } from "../server/actions";

export function DeleteMedicalRecordButton({ recordId }: { recordId: string }) {
  const t = useTranslations("medical");
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
            const result = await deleteMedicalRecordAction(recordId);
            if (result && !result.ok) setFailed(true);
          });
        }}
      >
        {t("delete")}
      </Button>
    </div>
  );
}
