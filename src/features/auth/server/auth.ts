import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db/client";
import { accounts, rateLimits, sessions, users, verifications } from "@/db/schema";
import { isValidTimeZone } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { errorReporter } from "@/lib/error-reporter";
import { smtpMailer, type Mailer } from "@/lib/notify/email";
import { PASSWORD_MIN_LENGTH } from "../schemas";
import { resetPasswordEmail, verificationEmail } from "./emails";
import { buildSocialProviders } from "./providers";

function createAuth(mailer: Mailer) {
  const env = getEnv();

  // Not awaited inside the handlers: response time must not reveal whether an account exists.
  const sendInBackground = (to: string, message: { subject: string; text: string }) => {
    mailer
      .send({ to, ...message })
      .catch((error: unknown) => errorReporter.report(error, { mail: message.subject }));
  };

  return betterAuth({
    appName: "Animal Logbook",
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        rateLimit: rateLimits,
      },
    }),
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        sendInBackground(user.email, resetPasswordEmail(url)),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        sendInBackground(user.email, verificationEmail(url)),
    },
    user: {
      additionalFields: {
        timezone: { type: "string", required: false, input: true },
        locale: { type: "string", required: false, input: false },
        weightUnit: { type: "string", required: false, input: false },
        defaultCurrency: { type: "string", required: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const timezone =
              typeof user.timezone === "string" && isValidTimeZone(user.timezone)
                ? user.timezone
                : "UTC";
            return { data: { ...user, timezone } };
          },
        },
      },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    socialProviders: buildSocialProviders(),
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

// Lazy so importing this module (e.g. during `next build`) needs no database or secrets.
export function getAuth(): Auth {
  instance ??= createAuth(smtpMailer);
  return instance;
}
