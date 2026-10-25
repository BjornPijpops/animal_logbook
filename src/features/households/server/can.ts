import { assertNever } from "@/lib/result";

export type Role = "owner" | "editor" | "viewer";
export type Action = "data:read" | "data:write" | "members:manage";

export function can(role: Role, action: Action): boolean {
  switch (action) {
    case "data:read":
      return true;
    case "data:write":
      return role === "owner" || role === "editor";
    case "members:manage":
      return role === "owner";
    default:
      return assertNever(action);
  }
}
