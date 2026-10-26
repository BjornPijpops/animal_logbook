import { getEnv } from "@/lib/env";
import { smtpMailer } from "@/lib/notify/email";

// Usage: node dist/send-test-email.mjs you@example.org
// Sends one message through the configured SMTP server and prints the result without any secrets.
async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to?.includes("@")) throw new Error("Usage: send-test-email <recipient address>");
  const env = getEnv();
  console.log(`Sending via ${env.SMTP_HOST}:${env.SMTP_PORT} from ${env.EMAIL_FROM} ...`);
  await smtpMailer.send({
    to,
    subject: "Animal Logbook test email",
    text: "If you can read this, outgoing email is configured correctly.",
  });
  console.log("Sent. Check the inbox (and the spam folder).");
}

main().catch((error: unknown) => {
  console.error(`Failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
