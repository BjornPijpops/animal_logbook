import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import type { FoodAnimalOption } from "./food-plan-form";

type Props = {
  animals: FoodAnimalOption[];
  values: { animalId: string | null; from: string | null; to: string | null };
  withRange: boolean;
};

// A plain GET form, so the filter lives in the URL and works without client JavaScript.
export async function FoodFilter({ animals, values, withRange }: Props) {
  const t = await getTranslations("food");
  return (
    <form method="get" className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <Field id="filter-animal" label={t("filter.animal")}>
        {(aria) => (
          <Select {...aria} name="animal" defaultValue={values.animalId ?? ""}>
            <option value="">{t("filter.allAnimals")}</option>
            {animals.map((animal) => (
              <option key={animal.id} value={animal.id}>
                {animal.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {withRange ? (
        <>
          <Field id="filter-from" label={t("filter.from")}>
            {(aria) => <Input {...aria} type="date" name="from" defaultValue={values.from ?? ""} />}
          </Field>
          <Field id="filter-to" label={t("filter.to")}>
            {(aria) => <Input {...aria} type="date" name="to" defaultValue={values.to ?? ""} />}
          </Field>
        </>
      ) : null}
      <Button type="submit" variant="secondary">
        {t("filter.apply")}
      </Button>
    </form>
  );
}
