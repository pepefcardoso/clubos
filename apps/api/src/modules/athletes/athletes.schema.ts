import { z } from "zod";

export const CreateAthleteSchema = z.object({
  name: z.string().min(2).max(120),
  cpf: z
    .string()
    .regex(/^\d{11}$/, "CPF must contain exactly 11 digits (no mask)"),
  birthDate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "birthDate must be an ISO date string (YYYY-MM-DD)",
    ),
  position: z.string().max(60).optional(),
});

export const UpdateAthleteSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  birthDate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "birthDate must be an ISO date string (YYYY-MM-DD)",
    )
    .optional(),
  position: z.string().max(60).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

export const ListAthletesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

export type CreateAthleteInput = z.infer<typeof CreateAthleteSchema>;
export type UpdateAthleteInput = z.infer<typeof UpdateAthleteSchema>;
export type ListAthletesQuery = z.infer<typeof ListAthletesQuerySchema>;

export interface AthleteResponse {
  id: string;
  name: string;
  cpf: string;
  birthDate: Date;
  position: string | null;
  status: string;
  createdAt: Date;
}
