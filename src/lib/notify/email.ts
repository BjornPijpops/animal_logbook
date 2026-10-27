import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isDemoRecipient } from "./demo-guard";

export type EmailMessage = { to: string; subject: string; text: string };

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

let transporter: Transporter | undefined;

// Plain SMTP (ADR 0008): Mailpit in development, any SMTP server in production.
export const smtpMailer: Mailer = {
  async send(message) {
    if (isDemoRecipient(message.to)) {
      logger.info("email suppressed for a demo recipient");
      return;
    }
    const env = getEnv();
    transporter ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    await transporter.sendMail({ from: env.EMAIL_FROM, ...message });
    logger.info("email sent");
  },
};
