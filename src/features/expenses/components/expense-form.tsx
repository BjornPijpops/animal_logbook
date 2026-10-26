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
import { EXPENSE_CATEGORY_VALUES, expenseInputSchema, type ExpenseInput } from "../schemas";
import { createExpenseAction, updateExpenseAction } from "../server/actions";

export type AnimalOption = { id: string; name: string };
export type MedicationOption = { id: string; name: string; animalName: string };

type Props = {
  animals: AnimalOption[];
  medications: MedicationOption[];
  defaults: ExpenseInput;
  expenseId?: string;
};

const ERROR_KEYS = ["validation", "not_found", "forbidden", "conflict"] as const;
const errorKey = (code: string) => ERROR_KEYS.find((k) => k === code) ?? "other";
const FIELD_ERRORS = ["invalid", "invalid_amount"] as const;

export function ExpenseForm({ animals, medications, defaults, expenseId }: Props) {
  const t = useTranslations("expenses");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<"idle" | "saved" | { error: string }>("idle");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseInputSchema),
    defaultValues: defaults,
  });

  const fieldError = (name: keyof ExpenseInput) => {
    const message = errors[name]?.message;
    if (!message) return undefined;
    const known = FIELD_ERRORS.find((m) => m === message);
    return known ? t(`errors.${known}`) : tc("required");
  };

  async function onSubmit(values: ExpenseInput) {
    const result = expenseId
      ? await updateExpenseAction(expenseId, values)
      : await createExpenseAction(values);
    if (!result) return;
    setStatus(result.ok ? "saved" : { error: t(`errors.${errorKey(result.code)}`) });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {status === "saved" ? <Alert tone="success">{t("saved")}</Alert> : null}
      {typeof status === "object" ? <Alert tone="error">{status.error}</Alert> : null}
      <Field id="description" label={t("fields.description")} error={fieldError("description")}>
        {(aria) => <Input {...aria} {...register("description")} />}
      </Field>
      <Field id="category" label={t("fields.category")}>
        {(aria) => (
          <Select {...aria} {...register("category")}>
            {EXPENSE_CATEGORY_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`categories.${value}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="amount"
          label={t("fields.amount")}
          hint={t("hints.amount")}
          error={fieldError("amount")}
        >
          {(aria) => <Input {...aria} inputMode="decimal" {...register("amount")} />}
        </Field>
        <Field id="currency" label={t("fields.currency")}>
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
      <Field id="date" label={t("fields.date")} error={fieldError("date")}>
        {(aria) => <Input {...aria} type="date" {...register("date")} />}
      </Field>
      <Field id="animalId" label={t("fields.animal")}>
        {(aria) => (
          <Select {...aria} {...register("animalId")}>
            <option value="">{t("fields.noAnimal")}</option>
            {animals.map((animal) => (
              <option key={animal.id} value={animal.id}>
                {animal.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="medicationId" label={t("fields.medication")} hint={t("hints.medication")}>
        {(aria) => (
          <Select {...aria} {...register("medicationId")}>
            <option value="">{t("fields.noMedication")}</option>
            {medications.map((medication) => (
              <option key={medication.id} value={medication.id}>
                {medication.name} · {medication.animalName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="notes" label={t("fields.notes")}>
        {(aria) => <Textarea {...aria} {...register("notes")} />}
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {expenseId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
