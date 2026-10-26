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

export function buildExpensesCsv(rows: ExpenseListRow[]): string {
  const lines = [HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.incurredOn,
        row.category,
        minorToInput(row.amountMinor, row.currency),
        row.currency,
        row.animalName ?? "",
        row.description,
        row.notes ?? "",
        row.appointmentId ? "appointment" : "manual",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}
