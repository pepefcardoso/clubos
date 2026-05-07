import { z } from "zod";

export const ListFansQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.enum(["totalSpentCents", "createdAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListFansQuery = z.infer<typeof ListFansQuerySchema>;

export interface FanResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  totalSpentCents: number;
  eventCount: number;
  createdAt: Date;
}
