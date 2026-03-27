import { z } from "zod";

export const EXPENSE_CATEGORIES = [
  "SALARY",
  "FIELD_MAINTENANCE",
  "EQUIPMENT",
  "TRAVEL",
  "ADMINISTRATIVE",
  "OTHER",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CreateExpenseSchema = z.object({
  description: z.string().min(2).max(200),
  amountCents: z.number().int().positive(),
  category: z.enum(EXPENSE_CATEGORIES).default("OTHER"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  notes: z.string().max(500).optional(),
});

export const UpdateExpenseSchema = z.object({
  description: z.string().min(2).max(200).optional(),
  amountCents: z.number().int().positive().optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
  notes: z.string().max(500).optional().nullable(),
});

export const ListExpensesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM")
    .optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
});

export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof ListExpensesQuerySchema>;

export interface ExpenseResponse {
  id: string;
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  /** ISO YYYY-MM-DD — no time component */
  date: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpensesListResult {
  data: ExpenseResponse[];
  total: number;
  page: number;
  limit: number;
}
