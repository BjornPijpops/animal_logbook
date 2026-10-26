"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import {
  fromGrams,
  WEIGHT_UNITS,
  weightInputSchema,
  type WeightInput,
  type WeightUnit,
} from "../schemas";
import { addWeightAction, deleteWeightAction } from "../server/actions";

const subscribeNever = () => () => undefined;

export type WeightView = {
  id: string;
  measuredAt: string;
  weightGrams: number;
  note: string | null;
};

type Props = {
  animalId: string;
  unit: WeightUnit;
  entries: WeightView[];
  today: string;
  canWrite: boolean;
};

export function WeightPanel({ animalId, unit, entries, today, canWrite }: Props) {
  const t = useTranslations("animals.weight");
  const ta = useTranslations("animals");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WeightInput>({
    resolver: zodResolver(weightInputSchema),
    defaultValues: { unit, measuredOn: today, note: "" },
  });

  const formatDate = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeZone: "UTC" });
  const formatWeight = (grams: number) => `${fromGrams(grams, unit)} ${unit}`;

  async function onSubmit(values: WeightInput) {
    setError(null);
    const result = await addWeightAction(animalId, values);
    if (!result.ok) {
      setError(result.code === "validation" ? t("invalid") : ta(`errors.${result.code}`));
      return;
    }
    reset({ unit: values.unit, measuredOn: values.measuredOn, note: "", weight: undefined });
    router.refresh();
  }

  const chartData = [...entries]
    .reverse()
    .map((e) => ({ label: formatDate(e.measuredAt), value: fromGrams(e.weightGrams, unit) }));
  const latest = entries[0];

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {latest ? (
        <p className="text-2xl font-semibold">
          {t("current", { value: formatWeight(latest.weightGrams) })}
        </p>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {entries.length > 1 && mounted ? (
        <div role="img" aria-label={t("chartLabel")} className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                unit={` ${unit}`}
                width={64}
                tick={{ fontSize: 12 }}
                domain={["auto", "auto"]}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {canWrite ? (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-3 sm:grid-cols-2">
          <Field id="weight" label={t("weight")} error={errors.weight ? t("invalid") : undefined}>
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                {...register("weight", { valueAsNumber: true })}
              />
            )}
          </Field>
          <Field id="weight-unit" label={t("unit")}>
            {(aria) => (
              <Select {...aria} {...register("unit")}>
                {WEIGHT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            id="measuredOn"
            label={t("date")}
            error={errors.measuredOn ? t("invalid") : undefined}
          >
            {(aria) => <Input {...aria} type="date" max={today} {...register("measuredOn")} />}
          </Field>
          <Field id="weight-note" label={t("note")}>
            {(aria) => <Input {...aria} maxLength={200} {...register("note")} />}
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {t("submit")}
            </Button>
          </div>
        </form>
      ) : null}

      <h3 className="text-base font-semibold">{t("history")}</h3>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("historyEmpty")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th scope="col" className="py-1 pr-2 font-medium">
                {t("columnDate")}
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                {t("columnWeight")}
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                {t("columnNote")}
              </th>
              <td className="w-1" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="py-2 pr-2">{formatDate(entry.measuredAt)}</td>
                <td className="py-2 pr-2">{formatWeight(entry.weightGrams)}</td>
                <td className="text-muted-foreground py-2 pr-2">{entry.note}</td>
                <td className="py-2 text-right">
                  {canWrite ? (
                    <Button
                      variant="destructive"
                      disabled={pending}
                      aria-label={t("delete", { date: formatDate(entry.measuredAt) })}
                      onClick={() => {
                        if (window.confirm(t("deleteConfirm"))) {
                          startTransition(async () => {
                            const result = await deleteWeightAction(animalId, entry.id);
                            if (result.ok) router.refresh();
                            else setError(ta(`errors.${result.code}`));
                          });
                        }
                      }}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      {tc("delete")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
