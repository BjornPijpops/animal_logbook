import { minorToInput } from "@/lib/money";
import type { ExpenseListRow } from "./expenses.repository";

// Deliberate exception to the repo's no-BOM rule: Excel needs it to read UTF-8. It is emitted
// at runtime only, never stored in a tracked file.
export const CSV_BOM = "\uFEFF";

const HEADER = [
  "date",
  "category",
  "amount",
  "currency",
  "animal",
  "description",
  "notes",
  "source",
] as const;

// Spreadsheets run cells that start with these characters as formulas.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

// App-generated numbers (including negatives) are not formulas, so they skip the prefix; every
// free-text column still goes through csvCell. Anything that is not a plain number falls back to it.
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
export function csvNumberCell(value: string): string {
  return PLAIN_NUMBER.test(value) ? value : csvCell(value);
}

export const EXPORT_TRUNCATED_NOTE = (limit: number) =>
  `# Export truncated: only the first ${limit} entries are included. Narrow the filter to export the rest.`;

export function buildExpensesCsv(
  rows: ExpenseListRow[],
  truncatedAt: number | null = null,
): string {
  const lines = truncatedAt === null ? [] : [EXPORT_TRUNCATED_NOTE(truncatedAt)];
  lines.push(HEADER.join(","));
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.incurredOn),
        csvCell(row.category),
        csvNumberCell(minorToInput(row.amountMinor, row.currency)),
        csvCell(row.currency),
        csvCell(row.animalName ?? ""),
        csvCell(row.description),
        csvCell(row.notes ?? ""),
        csvCell(row.appointmentId ? "appointment" : "manual"),
      ].join(","),
    );
  }
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}
