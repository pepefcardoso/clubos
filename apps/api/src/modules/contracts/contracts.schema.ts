import { z } from "zod";

// ISO date string YYYY-MM-DD — same pattern as athletes birthDate
const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date string (YYYY-MM-DD)");

export const CreateContractSchema = z
  .object({
    athleteId: z.string().min(1),
    type: z.enum(["PROFESSIONAL", "AMATEUR", "FORMATIVE", "LOAN"]),
    startDate: isoDateString,
    endDate: isoDateString.optional(),
    bidRegistered: z.boolean().optional(),
    federationCode: z.string().max(100).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strip();

// PUT: athleteId and type are immutable post-creation — excluded from this schema
export const UpdateContractSchema = z
  .object({
    status: z.enum(["ACTIVE", "EXPIRED", "TERMINATED", "SUSPENDED"]).optional(),
    endDate: isoDateString.nullable().optional(),
    bidRegistered: z.boolean().optional(),
    federationCode: z.string().max(100).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .strip();

export const ListContractsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  athleteId: z.string().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "TERMINATED", "SUSPENDED"]).optional(),
});

export type CreateContractInput = z.infer<typeof CreateContractSchema>;
export type UpdateContractInput = z.infer<typeof UpdateContractSchema>;
export type ListContractsQuery = z.infer<typeof ListContractsQuerySchema>;

export interface ContractResponse {
  id: string;
  athleteId: string;
  type: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  bidRegistered: boolean;
  federationCode: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
