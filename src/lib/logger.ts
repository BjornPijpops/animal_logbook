import pino from "pino";

// Drizzle puts the bound query parameters (names, emails, notes) into the error message, and the
// message is copied into the stack. Both are cut at "params:" before anything is logged.
const PARAMS = /\nparams: [\s\S]*$/;

export function sanitizeError(error: unknown): unknown {
  const serialized = pino.stdSerializers.err(
    error instanceof Error ? error : new Error(String(error)),
  );
  const clean = (value: unknown): unknown =>
    typeof value === "string" ? value.replace(PARAMS, "") : value;
  return {
    ...serialized,
    message: clean(serialized.message),
    stack: clean(serialized.stack),
    ...(serialized.cause ? { cause: sanitizeError(serialized.cause) } : {}),
  };
}

// Read directly (not via getEnv) so logging never fails on missing config.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.cookie", "req.headers.authorization", "password", "token", "*.password"],
  serializers: { err: sanitizeError, error: sanitizeError },
});
