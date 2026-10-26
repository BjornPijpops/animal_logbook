"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { CURRENCIES } from "@/lib/money";
import { purchaseInputSchema, type PurchaseInput } from "../schemas";
import { logPurchaseAction } from "../server/actions";

export function PurchaseForm({ planId, defaults }: { planId: string; defaults: PurchaseInput }) {
  const t = useTranslations("food");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseInput>({
    resolver: zodResolver(purchaseInputSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: PurchaseInput) {
    const result = await logPurchaseAction(planId, values);
    setStatus(result.ok ? "saved" : "error");
    if (result.ok) reset({ ...defaults, notes: "", amount: "" });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {status === "saved" ? <Alert tone="success">{t("purchases.logged")}</Alert> : null}
      {status === "error" ? <Alert tone="error">{t("errors.other")}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="purchase-date"
          label={t("purchases.date")}
          error={errors.date ? tc("required") : undefined}
        >
          {(aria) => <Input {...aria} type="date" {...register("date")} />}
        </Field>
        <Field
          id="purchase-amount"
          label={t("purchases.amount")}
          error={errors.amount ? t("errors.invalid_amount") : undefined}
        >
          {(aria) => <Input {...aria} inputMode="decimal" {...register("amount")} />}
        </Field>
        <Field id="purchase-currency" label={t("purchases.currency")}>
          {(aria) => (
            <Select {...aria} {...register("currency")}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field id="purchase-notes" label={t("purchases.notes")}>
        {(aria) => <Textarea {...aria} {...register("notes")} />}
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {t("purchases.log")}
      </Button>
    </form>
  );
}
