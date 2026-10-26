// Money is always integer minor units plus an ISO 4217 code; floats never touch storage.
export const CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CAD",
  "AUD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "JPY",
] as const;

export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return CURRENCIES.some((code) => code === value);
}

export function minorUnitDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

// Accepts "12", "12.5" or "12,50"; thousands separators and extra decimals are rejected
// rather than guessed at.
export function parseMoney(input: string, currency: string): number | null {
  const text = input.trim().replace(/\s/g, "");
  const match = /^(\d{1,9})(?:[.,](\d+))?$/.exec(text);
  if (!match) return null;
  const digits = minorUnitDigits(currency);
  const fraction = match[2] ?? "";
  if (fraction.length > digits) return null;
  const minor = Number(match[1] + fraction.padEnd(digits, "0"));
  return Number.isSafeInteger(minor) && minor <= 2_147_483_647 ? minor : null;
}

export function formatMoney(minor: number, currency: string, locale: string): string {
  const digits = minorUnitDigits(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minor / 10 ** digits,
  );
}

// For prefilling an input; the inverse of parseMoney.
export function minorToInput(minor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  return digits === 0 ? String(minor) : (minor / 10 ** digits).toFixed(digits);
}
