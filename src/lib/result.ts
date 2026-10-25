export type AppErrorCode =
  "validation" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "rate_limited";

export type AppError = { code: AppErrorCode; message: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = (code: AppErrorCode, message: string): Result<never> => ({
  ok: false,
  error: { code, message },
});

export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
