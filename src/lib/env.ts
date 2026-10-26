import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  FILE_TOKEN_SECRET: z.string().min(32).optional(),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(15),
  HOUSEHOLD_QUOTA_MB: z.coerce.number().int().min(1).default(500),
  FILE_RETENTION_DAYS: z.coerce.number().int().min(0).default(30),
  VIRUS_SCANNER: z.enum(["none", "clamav"]).default("none"),
  CLAMAV_HOST: z.string().default("localhost"),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: booleanString.default(false),
  EMAIL_FROM: z.string().default("Animal Logbook <no-reply@localhost>"),
  TRUSTED_PROXY: booleanString.default(false),
  TRUSTED_PROXY_CIDRS: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Parsed lazily so `next build` and tests do not need a full environment.
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}
