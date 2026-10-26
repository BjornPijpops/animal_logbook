"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { AppErrorCode } from "@/lib/result";
import {
  animalInputSchema,
  BREED_SUGGESTIONS,
  GENDERS,
  SPECIES,
  STERILIZED,
  type AnimalInput,
} from "../schemas";
import { createAnimalAction, updateAnimalAction } from "../server/actions";

type Props = {
  animalId?: string;
  defaults: AnimalInput;
  hints: { speciesOther: string[]; breeds: string[] };
};

export function AnimalForm({ animalId, defaults, hints }: Props) {
  const t = useTranslations("animals");
  const tc = useTranslations("common");
  const router = useRouter();
  const [error, setError] = useState<AppErrorCode | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AnimalInput>({ resolver: zodResolver(animalInputSchema), defaultValues: defaults });

  const species = useWatch({ control, name: "species" });
  const breedOptions = [...new Set([...(BREED_SUGGESTIONS[species] ?? []), ...hints.breeds])].sort(
    (a, b) => a.localeCompare(b),
  );

  const fieldError = (name: keyof AnimalInput) =>
    errors[name]
      ? name === "name" || name === "speciesOther"
        ? tc("required")
        : tc("invalid")
      : undefined;

  async function onSubmit(values: AnimalInput) {
    setError(null);
    const result = animalId
      ? await updateAnimalAction(animalId, values)
      : await createAnimalAction(values);
    if (!result.ok) {
      setError(result.code);
      return;
    }
    router.push(`/animals/${animalId ?? result.id ?? ""}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {error ? <Alert tone="error">{t(`errors.${error}`)}</Alert> : null}

      <Field id="name" label={t("fields.name")} error={fieldError("name")}>
        {(aria) => <Input {...aria} autoComplete="off" maxLength={80} {...register("name")} />}
      </Field>

      <Field id="species" label={t("fields.species")} error={fieldError("species")}>
        {(aria) => (
          <Select {...aria} {...register("species")}>
            {SPECIES.map((s) => (
              <option key={s} value={s}>
                {t(`species.${s}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {species === "other" ? (
        <Field
          id="speciesOther"
          label={t("fields.speciesOther")}
          error={fieldError("speciesOther")}
        >
          {(aria) => (
            <>
              <Input
                {...aria}
                list="species-other-options"
                maxLength={60}
                {...register("speciesOther")}
              />
              <datalist id="species-other-options">
                {hints.speciesOther.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </>
          )}
        </Field>
      ) : null}

      <Field
        id="breed"
        label={t("fields.breed")}
        hint={t("hints.breed")}
        error={fieldError("breed")}
      >
        {(aria) => (
          <>
            <Input {...aria} list="breed-options" maxLength={80} {...register("breed")} />
            <datalist id="breed-options">
              {breedOptions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </>
        )}
      </Field>

      <Field id="gender" label={t("fields.gender")} error={fieldError("gender")}>
        {(aria) => (
          <Select {...aria} {...register("gender")}>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {t(`gender.${g}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field id="birthDate" label={t("fields.birthDate")} error={fieldError("birthDate")}>
        {(aria) => <Input {...aria} type="date" {...register("birthDate")} />}
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5" {...register("birthDateIsEstimate")} />
        {t("fields.birthDateIsEstimate")}
      </label>

      <Field
        id="colorMarkings"
        label={t("fields.colorMarkings")}
        error={fieldError("colorMarkings")}
      >
        {(aria) => <Input {...aria} maxLength={200} {...register("colorMarkings")} />}
      </Field>
      <Field id="chipNumber" label={t("fields.chipNumber")} error={fieldError("chipNumber")}>
        {(aria) => (
          <Input {...aria} inputMode="numeric" maxLength={32} {...register("chipNumber")} />
        )}
      </Field>
      <Field
        id="registrationNumber"
        label={t("fields.registrationNumber")}
        error={fieldError("registrationNumber")}
      >
        {(aria) => <Input {...aria} maxLength={64} {...register("registrationNumber")} />}
      </Field>

      <Field id="sterilized" label={t("fields.sterilizedLabel")} error={fieldError("sterilized")}>
        {(aria) => (
          <Select {...aria} {...register("sterilized")}>
            {STERILIZED.map((s) => (
              <option key={s} value={s}>
                {t(`sterilized.${s}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <p className="text-muted-foreground text-sm">{t("hints.allergies")}</p>
      <Field
        id="emergencyNotes"
        label={t("fields.emergencyNotes")}
        hint={t("hints.emergencyNotes")}
        error={fieldError("emergencyNotes")}
      >
        {(aria) => <Textarea {...aria} maxLength={2000} {...register("emergencyNotes")} />}
      </Field>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
