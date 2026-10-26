"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { CURRENCIES } from "@/lib/money";
import { APPOINTMENT_TYPES, appointmentInputSchema, type AppointmentInput } from "../schemas";
import { createAppointmentAction, updateAppointmentAction } from "../server/actions";

export type AnimalOption = { id: string; name: string };
export type VaccinationOption = { id: string; animalId: string; title: string; startedOn: string };

type Props = {
  animals: AnimalOption[];
  vaccinations: VaccinationOption[];
  defaults: AppointmentInput;
  timezone: string;
  appointmentId?: string;
  hasLinkedRecord?: boolean;
};

const ERROR_KEYS = ["validation", "not_found", "forbidden"] as const;
const errorKey = (code: string) => ERROR_KEYS.find((k) => k === code) ?? "other";
const FIELD_ERRORS = ["invalid", "invalid_amount", "before_start", "not_applicable"] as const;

export function AppointmentForm({
  animals,
  vaccinations,
  defaults,
  timezone,
  appointmentId,
  hasLinkedRecord = false,
}: Props) {
  const t = useTranslations("appointments");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<"idle" | "saved" | { error: string }>("idle");
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentInput>({
    resolver: zodResolver(appointmentInputSchema),
    defaultValues: defaults,
  });
  const type = useWatch({ control, name: "type" });
  const animalId = useWatch({ control, name: "animalId" });
  const showVaccination = type === "vaccination" && animalId !== "" && !hasLinkedRecord;
  const linkable = vaccinations.filter((v) => v.animalId === animalId);

  const fieldError = (name: keyof AppointmentInput) => {
    const message = errors[name]?.message;
    if (!message) return undefined;
    const known = FIELD_ERRORS.find((m) => m === message);
    return known ? t(`errors.${known}`) : tc("required");
  };

  async function onSubmit(values: AppointmentInput) {
    const cleaned: AppointmentInput = {
      ...values,
      vaccinationRecord: showVaccination ? values.vaccinationRecord : "",
    };
    const result = appointmentId
      ? await updateAppointmentAction(appointmentId, cleaned)
      : await createAppointmentAction(cleaned);
    if (!result) return;
    setStatus(result.ok ? "saved" : { error: t(`errors.${errorKey(result.code)}`) });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {status === "saved" ? <Alert tone="success">{t("saved")}</Alert> : null}
      {typeof status === "object" ? <Alert tone="error">{status.error}</Alert> : null}
      <Field id="type" label={t("fields.type")}>
        {(aria) => (
          <Select {...aria} {...register("type")}>
            {APPOINTMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`types.${value}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="title" label={t("fields.title")} error={fieldError("title")}>
        {(aria) => <Input {...aria} {...register("title")} />}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="date" label={t("fields.date")} error={fieldError("date")}>
          {(aria) => <Input {...aria} type="date" {...register("date")} />}
        </Field>
        <Field
          id="time"
          label={t("fields.time")}
          hint={t("hints.zone", { zone: timezone })}
          error={fieldError("time")}
        >
          {(aria) => <Input {...aria} type="time" {...register("time")} />}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cost" label={t("fields.cost")} hint={t("hints.cost")} error={fieldError("cost")}>
          {(aria) => <Input {...aria} inputMode="decimal" {...register("cost")} />}
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
      <Field
        id="followUpDate"
        label={t("fields.followUpDate")}
        hint={t("hints.followUp")}
        error={fieldError("followUpDate")}
      >
        {(aria) => <Input {...aria} type="date" {...register("followUpDate")} />}
      </Field>
      {showVaccination ? (
        <Field id="vaccinationRecord" label={t("fields.vaccination")} hint={t("hints.vaccination")}>
          {(aria) => (
            <Select {...aria} {...register("vaccinationRecord")}>
              <option value="">{t("vaccination.none")}</option>
              <option value="new">{t("vaccination.new")}</option>
              {linkable.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.title} ({record.startedOn})
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      <Field id="notes" label={t("fields.notes")}>
        {(aria) => <Textarea {...aria} {...register("notes")} />}
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {appointmentId ? t("save") : t("create")}
      </Button>
    </form>
  );
}
