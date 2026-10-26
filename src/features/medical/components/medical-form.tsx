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
  MEDICAL_RECORD_TYPES,
  RECORD_FIELDS,
  SEVERITIES,
  medicalRecordInputSchema,
  type MedicalRecordInput,
} from "../schemas";
import { createMedicalRecordAction, updateMedicalRecordAction } from "../server/actions";

export type AnimalOption = { id: string; name: string };

type Props = {
  animals: AnimalOption[];
  defaults: MedicalRecordInput;
  recordId?: string;
};

const ERROR_KEYS = ["validation", "not_found", "forbidden", "conflict"] as const;
const errorKey = (code: string) => ERROR_KEYS.find((k) => k === code) ?? "other";

export function MedicalForm({ animals, defaults, recordId }: Props) {
  const t = useTranslations("medical");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<"idle" | "saved" | { error: string }>("idle");
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MedicalRecordInput>({
    resolver: zodResolver(medicalRecordInputSchema),
    defaultValues: defaults,
  });
  const type = useWatch({ control, name: "type" });
  const fields = RECORD_FIELDS[type];

  const fieldError = (name: keyof MedicalRecordInput) => {
    const message = errors[name]?.message;
    if (!message) return undefined;
    if (message === "not_applicable" || message === "before_start") return t(`errors.${message}`);
    return tc("required");
  };

  async function onSubmit(values: MedicalRecordInput) {
    // Values of fields hidden for this type are dropped so a type change cannot carry them over.
    const cleaned: MedicalRecordInput = {
      ...values,
      endedOn: fields.endDate ? values.endedOn : "",
      severity: fields.severity ? values.severity : "",
      nextDueOn: fields.nextDue ? values.nextDueOn : "",
    };
    const result = recordId
      ? await updateMedicalRecordAction(recordId, cleaned)
      : await createMedicalRecordAction(cleaned);
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
            <option value="">{t("fields.none")}</option>
            {animals.map((animal) => (
              <option key={animal.id} value={animal.id}>
                {animal.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="type" label={t("fields.type")}>
        {(aria) => (
          <Select {...aria} {...register("type")}>
            {MEDICAL_RECORD_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`types.${value}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {type === "medication" ? <p className="text-sm">{t("hints.medication")}</p> : null}
      <Field id="title" label={t(`titleLabel.${type}`)} error={fieldError("title")}>
        {(aria) => <Input {...aria} {...register("title")} />}
      </Field>
      <Field
        id="startedOn"
        label={fields.endDate ? t("fields.startedOn") : t("fields.date")}
        error={fieldError("startedOn")}
      >
        {(aria) => <Input {...aria} type="date" {...register("startedOn")} />}
      </Field>
      {fields.endDate ? (
        <Field
          id="endedOn"
          label={t("fields.endedOn")}
          hint={t("hints.endedOn")}
          error={fieldError("endedOn")}
        >
          {(aria) => <Input {...aria} type="date" {...register("endedOn")} />}
        </Field>
      ) : null}
      {fields.severity ? (
        <Field id="severity" label={t("fields.severity")}>
          {(aria) => (
            <Select {...aria} {...register("severity")}>
              <option value="">{t("fields.none")}</option>
              {SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {t(`severity.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      {fields.nextDue ? (
        <Field
          id="nextDueOn"
          label={t("fields.nextDueOn")}
          hint={t("hints.nextDueOn")}
          error={fieldError("nextDueOn")}
        >
          {(aria) => <Input {...aria} type="date" {...register("nextDueOn")} />}
        </Field>
      ) : null}
      <Field id="notes" label={t("fields.notes")}>
        {(aria) => <Textarea {...aria} {...register("notes")} />}
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {recordId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
