import { assertNever } from "@/lib/result";

export type Role = "owner" | "editor" | "viewer";
export type Action =
  "data:read" | "data:write" | "members:manage" | "audit:read" | "data:export" | "household:delete";

export function can(role: Role, action: Action): boolean {
  switch (action) {
    case "data:read":
      return true;
    case "data:write":
      return role === "owner" || role === "editor";
    case "members:manage":
    case "audit:read":
    case "data:export":
    case "household:delete":
      return role === "owner";
    default:
      return assertNever(action);
  }
}
