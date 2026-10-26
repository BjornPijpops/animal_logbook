"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { deleteExpenseAction, restoreExpenseAction } from "../server/actions";

export function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  const t = useTranslations("expenses");
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
            const result = await deleteExpenseAction(expenseId);
            if (result && !result.ok) setFailed(true);
          });
        }}
      >
        {t("delete")}
      </Button>
    </div>
  );
}

export function RestoreExpenseButton({ id, label }: { id: string; label: string }) {
  const t = useTranslations("expenses");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="secondary"
        disabled={pending}
        aria-label={`${t("restore")}: ${label}`}
        onClick={() =>
          startTransition(async () => {
            const result = await restoreExpenseAction(id);
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
