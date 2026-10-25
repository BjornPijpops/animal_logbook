import { z } from "zod";

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: z.enum(["editor", "viewer"]),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const uuidSchema = z.uuid();

export const tokenSchema = z.string().min(20).max(200);
