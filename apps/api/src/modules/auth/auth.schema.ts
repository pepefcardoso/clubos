import { z } from "zod";

export const LoginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    role: z.enum(["ADMIN", "TREASURER"]),
    clubId: z.string(),
  }),
});

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
});

export type LoginBody = z.infer<typeof LoginBodySchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
