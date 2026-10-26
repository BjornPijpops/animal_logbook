import { describe, expect, it } from "vitest";
import { can, type Action, type Role } from "./can";

const cases: [Role, Action, boolean][] = [
  ["owner", "data:read", true],
  ["owner", "data:write", true],
  ["owner", "members:manage", true],
  ["editor", "data:read", true],
  ["editor", "data:write", true],
  ["editor", "members:manage", false],
  ["viewer", "data:read", true],
  ["viewer", "data:write", false],
  ["viewer", "members:manage", false],
];

describe("can", () => {
  it.each(cases)("%s / %s -> %s", (role, action, expected) => {
    expect(can(role, action)).toBe(expected);
  });
});
