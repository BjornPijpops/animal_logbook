import { describe, expect, it } from "vitest";
import { formatMoney, minorToInput, minorUnitDigits, parseMoney } from "./money";

describe("parseMoney", () => {
  it.each([
    ["12", "EUR", 1200],
    ["12.5", "EUR", 1250],
    ["12,50", "EUR", 1250],
    ["0.07", "USD", 7],
    [" 1 234", "EUR", 123400],
    ["1500", "JPY", 1500],
  ])("%s %s -> %s", (input, currency, expected) => {
    expect(parseMoney(input, currency)).toBe(expected);
  });

  it.each([
    ["12.345", "EUR"],
    ["1.5", "JPY"],
    ["-3", "EUR"],
    ["abc", "EUR"],
    ["", "EUR"],
    ["1,234.50", "EUR"],
  ])("rejects %s %s", (input, currency) => {
    expect(parseMoney(input, currency)).toBeNull();
  });

  it("avoids float rounding: 0.1 + 0.2 style values stay exact", () => {
    expect(parseMoney("19.99", "EUR")).toBe(1999);
    expect(parseMoney("1.15", "EUR")).toBe(115);
  });

  it("rejects amounts that overflow a 32-bit column", () => {
    expect(parseMoney("999999999", "EUR")).toBeNull();
  });
});

describe("formatting", () => {
  it("knows minor unit digits", () => {
    expect(minorUnitDigits("EUR")).toBe(2);
    expect(minorUnitDigits("JPY")).toBe(0);
  });

  it("formats and round-trips", () => {
    expect(formatMoney(1250, "EUR", "en")).toBe("€12.50");
    expect(minorToInput(1250, "EUR")).toBe("12.50");
    expect(minorToInput(1500, "JPY")).toBe("1500");
    expect(parseMoney(minorToInput(1999, "EUR"), "EUR")).toBe(1999);
  });
});
