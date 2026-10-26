import { describe, expect, it } from "vitest";
import { sanitizeError } from "./logger";

describe("sanitizeError", () => {
  it("removes bound query parameters from the message, the stack and the cause", () => {
    const error = new Error(
      "Failed query: insert into animals (name) values ($1)\nparams: Secret Name,x@y.z",
      {
        cause: new Error("db failed\nparams: another secret"),
      },
    );
    const text = JSON.stringify(sanitizeError(error));
    expect(text).toContain("Failed query");
    expect(text).not.toContain("Secret Name");
    expect(text).not.toContain("x@y.z");
    expect(text).not.toContain("another secret");
  });
});
