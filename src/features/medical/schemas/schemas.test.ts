import { describe, expect, it } from "vitest";
import { medicalRecordInputSchema } from "./index";

const base = {
  animalId: "11111111-1111-4111-8111-111111111111",
  type: "illness",
  title: "Ear infection",
  startedOn: "2024-03-01",
  endedOn: "",
  severity: "",
  nextDueOn: "",
  notes: "",
} as const;

const issuePaths = (input: unknown) => {
  const result = medicalRecordInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}:${i.message}`);
};

describe("medicalRecordInputSchema", () => {
  it("accepts a valid illness with severity and end date", () => {
    expect(issuePaths({ ...base, severity: "mild", endedOn: "2024-03-10" })).toEqual([]);
  });

  it("accepts a vaccination on a leap day with a next-due date", () => {
    expect(
      issuePaths({
        ...base,
        type: "vaccination",
        startedOn: "2024-02-29",
        nextDueOn: "2025-02-28",
      }),
    ).toEqual([]);
  });

  it("rejects impossible calendar dates", () => {
    expect(issuePaths({ ...base, startedOn: "2023-02-29" })).not.toEqual([]);
  });

  it("rejects fields that do not apply to the type", () => {
    expect(issuePaths({ ...base, type: "surgery", severity: "mild" })).toEqual([
      "severity:not_applicable",
    ]);
    expect(issuePaths({ ...base, type: "illness", nextDueOn: "2024-04-01" })).toEqual([
      "nextDueOn:not_applicable",
    ]);
    expect(issuePaths({ ...base, type: "vaccination", endedOn: "2024-04-01" })).toEqual([
      "endedOn:not_applicable",
    ]);
  });

  it("rejects dates before the start date", () => {
    expect(issuePaths({ ...base, endedOn: "2024-02-28" })).toEqual(["endedOn:before_start"]);
    expect(issuePaths({ ...base, type: "vaccination", nextDueOn: "2024-02-28" })).toEqual([
      "nextDueOn:before_start",
    ]);
  });

  it("requires a title", () => {
    expect(issuePaths({ ...base, title: "  " })).not.toEqual([]);
  });
});
