"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  MAX_TIMES_PER_DAY,
  medicationInputSchema,
  SCHEDULE_KINDS,
  WEEKDAYS,
  type MedicationInput,
} from "../schemas";
import { createMedicationAction, updateMedicationAction } from "../server/actions";

export type AnimalOption = { id: string; name: string };

type Props = {
  animals: AnimalOption[];
  defaults: MedicationInput;
  medicationId?: string;
  fromRecordId?: string;
};

const ERROR_KEYS = ["validation", "not_found", "forbidden", "conflict"] as const;
const errorKey = (code: string) => ERROR_KEYS.find((k) => k === code) ?? "other";
const FIELD_MESSAGES = [
  "before_start",
  "duplicate_time",
  "times_required",
  "weekdays_required",
  "interval_required",
] as const;

export function MedicationForm({ animals, defaults, medicationId, fromRecordId }: Props) {
  const t = useTranslations("medications");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<"idle" | "saved" | { error: string }>("idle");
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MedicationInput>({
    resolver: zodResolver(medicationInputSchema),
    defaultValues: defaults,
  });
  const kind = useWatch({ control, name: "kind" });
  const times = useWatch({ control, name: "times" });
  const weekdays = useWatch({ control, name: "weekdays" });

  const fieldError = (name: keyof MedicationInput) => {
    const message = errors[name]?.message;
    if (!message) return undefined;
    const known = FIELD_MESSAGES.find((m) => m === message);
    return known ? t(`errors.${known}`) : tc("required");
  };

  const setTimes = (next: string[]) => setValue("times", next, { shouldValidate: true });
  const toggleDay = (day: number) =>
    setValue(
      "weekdays",
      weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day],
      { shouldValidate: true },
    );

  async function onSubmit(values: MedicationInput) {
    // Settings that do not apply to the chosen schedule type are dropped before saving.
    const cleaned: MedicationInput = {
      ...values,
      times: values.kind === "as_needed" ? [] : values.times,
      weekdays: values.kind === "weekdays" ? values.weekdays : [],
      intervalDays: values.kind === "every_n_days" ? values.intervalDays : null,
    };
    const result = medicationId
      ? await updateMedicationAction(medicationId, cleaned)
      : await createMedicationAction(cleaned, fromRecordId);
    if (!result) return;
    setStatus(result.ok ? "saved" : { error: t(`errors.${errorKey(result.code)}`) });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {status === "saved" ? <Alert tone="success">{t("saved")}</Alert> : null}
      {typeof status === "object" ? <Alert tone="error">{status.error}</Alert> : null}
      <Field id="animalId" label={t("fields.animal")} error={fieldError("animalId")}>
        {(aria) => (
          <Select
            {...aria}
            {...register("animalId")}
            disabled={Boolean(medicationId ?? fromRecordId)}
          >
            <option value="">{t("fields.choose")}</option>
            {animals.map((animal) => (
              <option key={animal.id} value={animal.id}>
                {animal.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="name" label={t("fields.name")} error={fieldError("name")}>
        {(aria) => <Input {...aria} {...register("name")} />}
      </Field>
      <Field
        id="dosage"
        label={t("fields.dosage")}
        hint={t("hints.dosage")}
        error={fieldError("dosage")}
      >
        {(aria) => <Input {...aria} {...register("dosage")} />}
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
      <Field id="kind" label={t("fields.kind")} hint={t(`kindHints.${kind}`)}>
        {(aria) => (
          <Select {...aria} {...register("kind")}>
            {SCHEDULE_KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`kinds.${value}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {kind === "weekdays" ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("fields.weekdays")}</legend>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((day) => (
              <label key={day} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={weekdays.includes(day)}
                  onChange={() => toggleDay(day)}
                />
                {t(`weekday.${day}`)}
              </label>
            ))}
          </div>
          {fieldError("weekdays") ? (
            <p className="text-destructive text-sm">{fieldError("weekdays")}</p>
          ) : null}
        </fieldset>
      ) : null}

      {kind === "every_n_days" ? (
        <Field
          id="intervalDays"
          label={t("fields.intervalDays")}
          error={fieldError("intervalDays")}
        >
          {(aria) => (
            <Input
              {...aria}
              type="number"
              min={2}
              max={365}
              inputMode="numeric"
              {...register("intervalDays", {
                setValueAs: (value: string) => (value === "" ? null : Number(value)),
              })}
            />
          )}
        </Field>
      ) : null}

      {kind !== "as_needed" ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("fields.times")}</legend>
          {times.map((time, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                aria-label={t("fields.timeN", { n: index + 1 })}
                type="time"
                value={time}
                onChange={(event) =>
                  setTimes(times.map((value, i) => (i === index ? event.target.value : value)))
                }
              />
              {times.length > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setTimes(times.filter((_, i) => i !== index))}
                >
                  {t("removeTime", { n: index + 1 })}
                </Button>
              ) : null}
            </div>
          ))}
          {times.length < MAX_TIMES_PER_DAY ? (
            <Button type="button" variant="secondary" onClick={() => setTimes([...times, "12:00"])}>
              {t("addTime")}
            </Button>
          ) : null}
          {fieldError("times") ? (
            <p className="text-destructive text-sm">{fieldError("times")}</p>
          ) : null}
        </fieldset>
      ) : null}

      <Field id="notes" label={t("fields.notes")}>
        {(aria) => <Textarea {...aria} {...register("notes")} />}
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {medicationId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
