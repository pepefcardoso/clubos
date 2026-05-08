import { z } from "zod";

export const CreatePosProductSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(200),
  priceCents: z
    .number()
    .int("priceCents deve ser um inteiro (centavos, sem decimais)")
    .positive("priceCents deve ser maior que 0"),
  category: z.string().min(1).max(80).optional(),
  stock: z.number().int().nonnegative().optional(),
});

export const UpdatePosProductSchema = CreatePosProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const ListPosProductsQuerySchema = z.object({
  activeOnly: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type CreatePosProductInput = z.infer<typeof CreatePosProductSchema>;
export type UpdatePosProductInput = z.infer<typeof UpdatePosProductSchema>;
export type ListPosProductsQuery = z.infer<typeof ListPosProductsQuerySchema>;

export interface PosProductResponse {
  id: string;
  name: string;
  priceCents: number;
  category: string | null;
  stock: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PosProductsListResponse {
  data: PosProductResponse[];
  total: number;
}
