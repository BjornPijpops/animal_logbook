# ADR 0005: Money handling

Status: Accepted

## Decision

Money is stored as integer **minor units** plus ISO 4217 `currency` (`amount_minor integer`, `currency char(3)`). No floats anywhere in code or schema. `src/lib/money.ts` provides `parseMoney(input, currency, locale)`, `formatMoney`, and `sumByCurrency`, using `Intl.NumberFormat` to learn the currency's minor-unit digits (JPY = 0, EUR = 2).

Totals are grouped **per currency**; no FX conversion in V1 (conversion would need external rate data). Each expense keeps its own currency; the user's default currency pre-fills forms.

`expenses` is the only table aggregated for spending. Appointment/medication/food costs create linked expense rows (see DATA_MODEL) to prevent double entry.

## Consequences

- Aggregations are exact (`sum(amount_minor)` in SQL, `Intl` only for display).
- Mixed-currency households see one total per currency.
