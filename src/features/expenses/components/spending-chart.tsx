"use client";

import { useSyncExternalStore } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, minorUnitDigits } from "@/lib/money";

export type SpendingPoint = { key: string; label: string; minor: number };

type Props = {
  currency: string;
  points: SpendingPoint[];
  chartLabel: string;
  labelHeader: string;
  amountHeader: string;
  totalLabel: string;
};

const subscribeNever = () => () => undefined;

// Chart for sighted users plus an always-visible table, so the numbers never depend on the chart.
export function SpendingChart({
  currency,
  points,
  chartLabel,
  labelHeader,
  amountHeader,
  totalLabel,
}: Props) {
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const divisor = 10 ** minorUnitDigits(currency);
  const data = points.map((p) => ({ ...p, value: p.minor / divisor }));
  const total = points.reduce((sum, p) => sum + p.minor, 0);
  const money = (minor: number) => formatMoney(minor, currency, "en");

  return (
    <div className="space-y-3">
      {mounted ? (
        <div role="img" aria-label={chartLabel} className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis width={48} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => money(Math.round(Number(value) * divisor))} />
              <Bar dataKey="value" fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{chartLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{labelHeader}</th>
            <th scope="col" className="text-right">
              {amountHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row" className="font-normal">
                {point.label}
              </th>
              <td className="text-right">{money(point.minor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{totalLabel}</th>
            <td className="text-right font-semibold">{money(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
