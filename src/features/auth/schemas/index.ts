import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";

export const PASSWORD_MIN_LENGTH = 10;

const email = z.email().max(254);
const password = z.string().min(PASSWORD_MIN_LENGTH).max(128);

export const signUpSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  password,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({ email, password: z.string().min(1).max(128) });
export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ password });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const preferencesSchema = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  weightUnit: z.enum(["kg", "lb"]),
  defaultCurrency: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z]{3}$/.test(v), "Invalid currency"),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;
