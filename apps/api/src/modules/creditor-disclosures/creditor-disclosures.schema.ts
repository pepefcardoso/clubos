import { z } from "zod";

export const CREDITOR_STATUSES = ["PENDING", "SETTLED", "DISPUTED"] as const;
export type CreditorStatus = (typeof CREDITOR_STATUSES)[number];

export const CreateCreditorDisclosureSchema = z.object({
  creditorName: z
    .string()
    .min(2, "Nome do credor deve ter pelo menos 2 caracteres")
    .max(200, "Nome do credor deve ter no máximo 200 caracteres"),
  description: z.string().max(500).optional(),
  amountCents: z.number().int().positive("Valor deve ser maior que zero"),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be YYYY-MM-DD"),
});

/**
 * Only status may be mutated after creation (Lei 14.193/2021).
 * PENDING → SETTLED | DISPUTED only. Cannot revert to PENDING.
 */
export const UpdateCreditorStatusSchema = z.object({
  status: z.enum(["SETTLED", "DISPUTED"], {
    message:
      'Status inválido. Valores aceitos: "SETTLED" ou "DISPUTED". Não é permitido reverter para "PENDING".',
  }),
});

export const ListCreditorDisclosuresQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(CREDITOR_STATUSES).optional(),
  /** Optional ISO YYYY-MM-DD lower bound on dueDate */
  dueDateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dueDateFrom must be YYYY-MM-DD")
    .optional(),
  /** Optional ISO YYYY-MM-DD upper bound on dueDate */
  dueDateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dueDateTo must be YYYY-MM-DD")
    .optional(),
});

export interface CreditorDisclosureResponse {
  id: string;
  creditorName: string;
  description: string | null;
  amountCents: number;
  /** ISO YYYY-MM-DD — no time component */
  dueDate: string;
  status: CreditorStatus;
  registeredBy: string;
  /** ISO 8601 */
  registeredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditorDisclosuresListResult {
  data: CreditorDisclosureResponse[];
  total: number;
  page: number;
  limit: number;
  /**
   * Sum of all PENDING amountCents across all pages (not filtered by pagination).
   * Used by the SAF KPI dashboard (T-123).
   */
  pendingTotalCents: number;
}

export type CreateCreditorDisclosureInput = z.infer<
  typeof CreateCreditorDisclosureSchema
>;
export type UpdateCreditorStatusInput = z.infer<
  typeof UpdateCreditorStatusSchema
>;
export type ListCreditorDisclosuresQuery = z.infer<
  typeof ListCreditorDisclosuresQuerySchema
>;
