import pino from "pino";

// Read directly (not via getEnv) so logging never fails on missing config.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.cookie", "req.headers.authorization", "password", "token", "*.password"],
});
