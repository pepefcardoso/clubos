import { z } from "zod";

export const SearchAthletesQuerySchema = z.object({
  position: z.string().max(50).optional(),
  minAge: z.coerce.number().int().min(14).max(60).optional(),
  maxAge: z.coerce.number().int().min(14).max(60).optional(),
  state: z.string().max(2).optional(),
  rtpStatus: z.enum(["AFASTADO", "RETORNO_PROGRESSIVO", "LIBERADO"]).optional(),
  minAcwr: z.coerce.number().min(0).max(5).optional(),
  maxAcwr: z.coerce.number().min(0).max(5).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchAthletesQuery = z.infer<typeof SearchAthletesQuerySchema>;
