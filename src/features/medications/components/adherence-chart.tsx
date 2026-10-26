"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DayAdherence } from "../adherence";

const subscribeNever = () => () => undefined;

export function AdherenceChart({ days }: { days: DayAdherence[] }) {
  const t = useTranslations("medications.adherence");
  const format = useFormatter();
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const label = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const data = days.map((day) => ({ ...day, label: label(day.date) }));

  return (
    <div className="space-y-3">
      {mounted ? (
        <div role="img" aria-label={t("chartLabel")} className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="given" name={t("given")} stackId="d" fill="var(--primary)" />
              <Bar dataKey="skipped" name={t("skipped")} stackId="d" fill="#a16207" />
              <Bar dataKey="missed" name={t("missed")} stackId="d" fill="#b91c1c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          {t("showTable")}
        </summary>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t("chartLabel")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("date")}</th>
              <th scope="col">{t("given")}</th>
              <th scope="col">{t("skipped")}</th>
              <th scope="col">{t("missed")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((day) => (
              <tr key={day.date}>
                <th scope="row" className="font-normal">
                  {day.label}
                </th>
                <td>{day.given}</td>
                <td>{day.skipped}</td>
                <td>{day.missed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
