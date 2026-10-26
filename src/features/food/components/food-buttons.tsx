"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  deleteFoodPlanAction,
  restoreFoodPlanAction,
  unlinkPurchaseAction,
} from "../server/actions";

export function DeleteFoodPlanButton({ planId }: { planId: string }) {
  const t = useTranslations("food");
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
            const result = await deleteFoodPlanAction(planId);
            if (result && !result.ok) setFailed(true);
          });
        }}
      >
        {t("delete")}
      </Button>
    </div>
  );
}

export function RestoreFoodPlanButton({ id, label }: { id: string; label: string }) {
  const t = useTranslations("food");
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
            const result = await restoreFoodPlanAction(id);
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

export function UnlinkPurchaseButton({
  planId,
  expenseId,
  label,
}: {
  planId: string;
  expenseId: string;
  label: string;
}) {
  const t = useTranslations("food");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="secondary"
        disabled={pending}
        aria-label={`${t("purchases.unlink")}: ${label}`}
        onClick={() => {
          if (!window.confirm(t("purchases.unlinkConfirm"))) return;
          startTransition(async () => {
            const result = await unlinkPurchaseAction(planId, expenseId);
            setFailed(!result.ok);
          });
        }}
      >
        {t("purchases.unlink")}
      </Button>
      {failed ? (
        <span role="alert" className="text-destructive text-sm">
          {t("errors.other")}
        </span>
      ) : null}
    </>
  );
}
