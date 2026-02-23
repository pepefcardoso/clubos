import { z } from "zod";

export const CreateMemberSchema = z.object({
  name: z.string().min(2).max(120),
  cpf: z
    .string()
    .regex(/^\d{11}$/, "CPF must contain exactly 11 digits (no mask)"),
  phone: z
    .string()
    .regex(/^\d{10,11}$/, "Phone must contain 10 or 11 digits (no mask)"),
  email: z.email().optional(),
  planId: z.cuid().optional(),
  joinedAt: z.iso.datetime().optional(),
});

export type CreateMemberInput = z.infer<typeof CreateMemberSchema>;

export interface MemberPlanSummary {
  id: string;
  name: string;
}

export interface MemberResponse {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email: string | null;
  status: string;
  joinedAt: Date;
  plans: MemberPlanSummary[];
}

export interface ImportRowError {
  row: number;
  cpf?: string | undefined;
  field: string;
  message: string;
}

export interface ImportResult {
  imported: number;
  created: number;
  updated: number;
  errors: ImportRowError[];
}
