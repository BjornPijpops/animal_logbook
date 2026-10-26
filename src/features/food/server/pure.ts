import type { FoodUnit } from "./food.repository";

export type MealRow = { timeOfDay: string; amountCenti: number };

// The daily quantity is always the sum of the meals; nothing stores it.
export function dailyQuantity(meals: readonly MealRow[]): number {
  return meals.reduce((sum, meal) => sum + meal.amountCenti, 0);
}

export type PlanForHistory = {
  id: string;
  animalId: string;
  animalName: string;
  brand: string;
  flavor: string | null;
  unit: FoodUnit;
  startedOn: string;
  endedOn: string | null;
  startNote: string | null;
  endNote: string | null;
};

export type FoodChange = {
  date: string;
  kind: "started" | "ended";
  planId: string;
  animalId: string;
  animalName: string;
  label: string;
  note: string | null;
};

const planLabel = (plan: Pick<PlanForHistory, "brand" | "flavor">) =>
  plan.flavor ? `${plan.brand} ${plan.flavor}` : plan.brand;

// A plan contributes a start event and, when it has an end date, an end event.
// Same-day events keep a stable order: ends before starts, so a switch reads old -> new.
export function buildChanges(plans: readonly PlanForHistory[]): FoodChange[] {
  const changes: FoodChange[] = [];
  for (const plan of plans) {
    const base = {
      planId: plan.id,
      animalId: plan.animalId,
      animalName: plan.animalName,
      label: planLabel(plan),
    };
    changes.push({ ...base, date: plan.startedOn, kind: "started", note: plan.startNote });
    if (plan.endedOn) {
      changes.push({ ...base, date: plan.endedOn, kind: "ended", note: plan.endNote });
    }
  }
  const rank = { ended: 0, started: 1 } as const;
  return changes.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      rank[a.kind] - rank[b.kind] ||
      a.label.localeCompare(b.label) ||
      a.planId.localeCompare(b.planId),
  );
}

export type HealthEvent = {
  id: string;
  animalId: string;
  animalName: string;
  type: "allergy" | "illness" | "injury";
  title: string;
  date: string;
  endedOn: string | null;
};

export type InvestigationEntry =
  ({ source: "food" } & FoodChange) | ({ source: "record" } & HealthEvent);

export function mergeInvestigation(
  changes: readonly FoodChange[],
  events: readonly HealthEvent[],
): InvestigationEntry[] {
  const entries: InvestigationEntry[] = [
    ...changes.map((change) => ({ source: "food" as const, ...change })),
    ...events.map((event) => ({ source: "record" as const, ...event })),
  ];
  return entries.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.source === b.source ? 0 : a.source === "food" ? -1 : 1) ||
      a.animalName.localeCompare(b.animalName),
  );
}

export function inRange(date: string, from: string | null, to: string | null): boolean {
  return (from === null || date >= from) && (to === null || date <= to);
}
