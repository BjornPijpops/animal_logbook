"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  FOOD_TYPES,
  FOOD_UNITS,
  MAX_MEALS,
  foodPlanInputSchema,
  formatCenti,
  parseAmountCenti,
  type FoodPlanInput,
} from "../schemas";
import { createFoodPlanAction, updateFoodPlanAction } from "../server/actions";

export type FoodAnimalOption = { id: string; name: string };

type Props = {
  animals: FoodAnimalOption[];
  defaults: FoodPlanInput;
  planId?: string;
};

const ERROR_KEYS = ["validation", "not_found", "forbidden", "conflict"] as const;
const errorKey = (code: string) => ERROR_KEYS.find((k) => k === code) ?? "other";
const FIELD_ERRORS = [
  "invalid",
  "invalid_amount",
  "invalid_time",
  "invalid_kcal",
  "before_start",
] as const;

export function FoodPlanForm({ animals, defaults, planId }: Props) {
  const t = useTranslations("food");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<"idle" | "saved" | { error: string }>("idle");
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FoodPlanInput>({
    resolver: zodResolver(foodPlanInputSchema),
    defaultValues: defaults,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "meals" });
  const meals = useWatch({ control, name: "meals" });
  const unit = useWatch({ control, name: "unit" });

  const daily = (meals ?? []).reduce((sum, meal) => sum + (parseAmountCenti(meal.amount) ?? 0), 0);

  const message = (value: unknown) => {
    if (typeof value !== "string") return undefined;
    const known = FIELD_ERRORS.find((m) => m === value);
    return known ? t(`errors.${known}`) : tc("required");
  };
  const fieldError = (name: Exclude<keyof FoodPlanInput, "meals">) =>
    errors[name]?.message ? message(errors[name]?.message) : undefined;

  async function onSubmit(values: FoodPlanInput) {
    const result = planId
      ? await updateFoodPlanAction(planId, values)
      : await createFoodPlanAction(values);
    if (!result) return;
    setStatus(result.ok ? "saved" : { error: t(`errors.${errorKey(result.code)}`) });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {status === "saved" ? <Alert tone="success">{t("saved")}</Alert> : null}
      {typeof status === "object" ? <Alert tone="error">{status.error}</Alert> : null}
      <Field id="animalId" label={t("fields.animal")} error={fieldError("animalId")}>
        {(aria) => (
          <Select {...aria} {...register("animalId")}>
            <option value="">{t("fields.chooseAnimal")}</option>
            {animals.map((animal) => (
              <option key={animal.id} value={animal.id}>
                {animal.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="brand" label={t("fields.brand")} error={fieldError("brand")}>
          {(aria) => <Input {...aria} {...register("brand")} />}
        </Field>
        <Field id="flavor" label={t("fields.flavor")}>
          {(aria) => <Input {...aria} {...register("flavor")} />}
        </Field>
        <Field id="type" label={t("fields.type")}>
          {(aria) => (
            <Select {...aria} {...register("type")}>
              {FOOD_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`types.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="unit" label={t("fields.unit")} hint={t("hints.unit")}>
          {(aria) => (
            <Select {...aria} {...register("unit")}>
              {FOOD_UNITS.map((value) => (
                <option key={value} value={value}>
                  {t(`units.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="startedOn" label={t("fields.startedOn")} error={fieldError("startedOn")}>
          {(aria) => <Input {...aria} type="date" {...register("startedOn")} />}
        </Field>
        <Field
          id="endedOn"
          label={t("fields.endedOn")}
          hint={t("hints.endedOn")}
          error={fieldError("endedOn")}
        >
          {(aria) => <Input {...aria} type="date" {...register("endedOn")} />}
        </Field>
      </div>
      <Field
        id="kcalPer100g"
        label={t("fields.kcal")}
        hint={t("hints.kcal")}
        error={fieldError("kcalPer100g")}
      >
        {(aria) => <Input {...aria} inputMode="numeric" {...register("kcalPer100g")} />}
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">{t("meals.title")}</legend>
        {fields.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("meals.none")}</p>
        ) : null}
        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
            <Field
              id={`meal-time-${index}`}
              label={t("meals.time", { n: index + 1 })}
              error={message(errors.meals?.[index]?.time?.message)}
            >
              {(aria) => <Input {...aria} type="time" {...register(`meals.${index}.time`)} />}
            </Field>
            <Field
              id={`meal-amount-${index}`}
              label={t("meals.amount", { n: index + 1, unit: t(`units.${unit}`) })}
              error={message(errors.meals?.[index]?.amount?.message)}
            >
              {(aria) => (
                <Input {...aria} inputMode="decimal" {...register(`meals.${index}.amount`)} />
              )}
            </Field>
            <Button
              type="button"
              variant="secondary"
              aria-label={t("meals.remove", { n: index + 1 })}
              onClick={() => remove(index)}
            >
              {t("meals.removeShort")}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={fields.length >= MAX_MEALS}
          onClick={() => append({ time: "08:00", amount: "" })}
        >
          {t("meals.add")}
        </Button>
        <p className="text-sm" aria-live="polite">
          {t("meals.daily")}: {formatCenti(daily)} {t(`units.${unit}`)}
        </p>
      </fieldset>

      <Field id="startNote" label={t("fields.startNote")} hint={t("hints.startNote")}>
        {(aria) => <Textarea {...aria} {...register("startNote")} />}
      </Field>
      <Field id="endNote" label={t("fields.endNote")}>
        {(aria) => <Textarea {...aria} {...register("endNote")} />}
      </Field>
      <Field id="notes" label={t("fields.notes")}>
        {(aria) => <Textarea {...aria} {...register("notes")} />}
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {planId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
