import { describe, expect, it } from "vitest";
import { buildExpensesCsv, CSV_BOM, csvCell } from "../server/csv";
import type { ExpenseListRow } from "../server/expenses.repository";

function row(overrides: Partial<ExpenseListRow> = {}): ExpenseListRow {
  return {
    id: "id",
    animalId: null,
    animalName: null,
    category: "food",
    incurredOn: "2025-03-14",
    amountMinor: 1250,
    currency: "EUR",
    description: "Kibble",
    notes: null,
    appointmentId: null,
    medicationId: null,
    foodPlanId: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("csv export", () => {
  it("starts with a UTF-8 byte order mark and uses CRLF lines", () => {
    const csv = buildExpensesCsv([row()]);
    const bytes = Buffer.from(csv, "utf8");
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "date,category,amount,currency,animal,description,notes,source",
      "2025-03-14,food,12.50,EUR,,Kibble,,manual",
      "",
    ]);
  });

  it("neutralizes formula injection", () => {
    for (const start of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvCell(`${start}1+1`).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell("normal")).toBe("normal");
    expect(csvCell("a-b")).toBe("a-b");
  });

  it("quotes commas, quotes and newlines, and keeps unicode", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    const csv = buildExpensesCsv([row({ description: '=HYPERLINK("x")', notes: "Café, 🐕" })]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")","Café, 🐕"`);
  });

  it("formats zero-decimal currencies and marks appointment rows", () => {
    const csv = buildExpensesCsv([row({ currency: "JPY", amountMinor: 500, appointmentId: "a" })]);
    expect(csv).toContain("2025-03-14,food,500,JPY,,Kibble,,appointment");
  });
});
