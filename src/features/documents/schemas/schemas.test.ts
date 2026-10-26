import { describe, expect, it } from "vitest";
import { documentInputSchema, documentQuerySchema, expiryStatus } from "./index";

describe("expiryStatus", () => {
  it.each([
    [null, null],
    ["2024-02-28", "expired"],
    ["2024-03-01", "soon"],
    ["2024-03-31", "soon"],
    ["2024-04-01", "ok"],
  ])("%s -> %s on 2024-03-01", (date, expected) => {
    expect(expiryStatus(date, "2024-03-01")).toBe(expected);
  });

  it("handles leap days and year ends", () => {
    expect(expiryStatus("2024-02-29", "2024-02-29")).toBe("soon");
    expect(expiryStatus("2025-01-15", "2024-12-20")).toBe("soon");
    expect(expiryStatus("2025-01-20", "2024-12-20")).toBe("ok");
  });
});

describe("schemas", () => {
  it("accepts empty optional fields and rejects bad values", () => {
    const base = { type: "other", title: " Passport ", notes: "", expiresOn: "", animalId: "" };
    expect(documentInputSchema.parse(base).title).toBe("Passport");
    expect(documentInputSchema.safeParse({ ...base, title: "" }).success).toBe(false);
    expect(documentInputSchema.safeParse({ ...base, type: "contract" }).success).toBe(false);
    expect(documentInputSchema.safeParse({ ...base, expiresOn: "2024-02-30" }).success).toBe(false);
    expect(documentInputSchema.safeParse({ ...base, animalId: "nope" }).success).toBe(false);
  });

  it("applies query defaults", () => {
    expect(documentQuerySchema.parse({})).toEqual({
      q: "",
      animal: "",
      type: "",
      expiring: false,
      page: 1,
    });
    expect(documentQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});
