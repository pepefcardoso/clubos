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

export const UpdateMemberSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z
    .string()
    .regex(/^\d{10,11}$/, "Phone must contain 10 or 11 digits (no mask)")
    .optional(),
  email: z.email().optional().nullable(),
  planId: z.cuid().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "OVERDUE"]).optional(),
});

export const ListMembersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "OVERDUE"]).optional(),
});

export type CreateMemberInput = z.infer<typeof CreateMemberSchema>;
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
export type ListMembersQuery = z.infer<typeof ListMembersQuerySchema>;

export interface MemberPlanSummary {
  id: string;
  name: string;
  priceCents: number;
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
