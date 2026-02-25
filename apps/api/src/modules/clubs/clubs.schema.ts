import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const cnpjRegex = /^\d{14}$/;

export const CreateClubSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(
      slugRegex,
      'Slug must be lowercase alphanumeric with hyphens, e.g. "my-club"',
    ),
  cnpj: z
    .string()
    .regex(cnpjRegex, "CNPJ must contain exactly 14 digits (no mask)")
    .optional(),
});

export type CreateClubInput = z.infer<typeof CreateClubSchema>;

export interface ClubResponse {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
  planTier: string;
  createdAt: Date;
}
