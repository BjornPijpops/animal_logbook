import { useTranslations } from "next-intl";
import type { UseFormRegister } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { DOCUMENT_TYPES, type DocumentInput } from "../schemas";

export type AnimalOption = { id: string; name: string };

type Props = {
  register: UseFormRegister<DocumentInput>;
  animals: AnimalOption[];
  errors: Partial<Record<keyof DocumentInput, unknown>>;
};

// Shared by the upload and edit forms so both validate and label the metadata the same way.
export function DocumentFields({ register, animals, errors }: Props) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  return (
    <>
      <Field id="title" label={t("fields.title")} error={errors.title ? tc("required") : undefined}>
        {(aria) => <Input {...aria} {...register("title")} />}
      </Field>
      <Field id="type" label={t("fields.type")}>
        {(aria) => (
          <Select {...aria} {...register("type")}>
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </Select>
        )}
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
      <Field
        id="expiresOn"
        label={t("fields.expiresOn")}
        hint={t("hints.expiresOn")}
        error={errors.expiresOn ? tc("invalid") : undefined}
      >
        {(aria) => <Input {...aria} type="date" {...register("expiresOn")} />}
      </Field>
      <Field id="notes" label={t("fields.notes")}>
        {(aria) => <Textarea {...aria} {...register("notes")} />}
      </Field>
    </>
  );
}
