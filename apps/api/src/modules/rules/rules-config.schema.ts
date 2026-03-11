import { z } from "zod";

const EscalationRequirementsSchema = z.object({
  requireBidRegistered: z.boolean({
    error: "requireBidRegistered é obrigatório",
  }),
  requireActiveContract: z.boolean({
    error: "requireActiveContract é obrigatório",
  }),
  minContractActiveDays: z
    .number({ error: "minContractActiveDays é obrigatório" })
    .int("minContractActiveDays deve ser um número inteiro")
    .min(0, "minContractActiveDays não pode ser negativo")
    .default(0),
});

export const RuleSetSchema = z.object({
  maxAgeFormativeYears: z
    .number()
    .int("maxAgeFormativeYears deve ser um inteiro")
    .min(14, "Idade mínima permitida é 14 anos")
    .max(40, "Idade máxima permitida é 40 anos")
    .nullable()
    .default(20),
  maxAgeAmateurYears: z
    .number()
    .int("maxAgeAmateurYears deve ser um inteiro")
    .min(14, "Idade mínima permitida é 14 anos")
    .max(40, "Idade máxima permitida é 40 anos")
    .nullable()
    .default(23),
  minContractDurationDays: z
    .number()
    .int("minContractDurationDays deve ser um inteiro")
    .min(1, "Duração mínima do contrato é 1 dia")
    .default(30),
  allowedContractTypesForEscalation: z
    .array(z.enum(["PROFESSIONAL", "AMATEUR", "FORMATIVE", "LOAN"]))
    .min(1, "Pelo menos um tipo de contrato deve ser permitido para escalação"),
  escalationRequirements: EscalationRequirementsSchema,
});

export const CreateRulesConfigSchema = z.object({
  season: z
    .string()
    .min(4, "Temporada deve ter pelo menos 4 caracteres (ex: '2025')")
    .max(10, "Temporada deve ter no máximo 10 caracteres (ex: '2025/2026')"),
  league: z
    .string()
    .min(2, "Liga deve ter pelo menos 2 caracteres")
    .max(50, "Liga deve ter no máximo 50 caracteres"),
  rules: RuleSetSchema,
  isActive: z.boolean().default(true),
});

export const UpdateRulesConfigSchema = z.object({
  rules: RuleSetSchema.optional(),
  isActive: z.boolean().optional(),
});

export const ValidateAthleteQuerySchema = z.object({
  athleteId: z.string().min(1, "athleteId é obrigatório"),
});

export type CreateRulesConfigInput = z.infer<typeof CreateRulesConfigSchema>;
export type UpdateRulesConfigInput = z.infer<typeof UpdateRulesConfigSchema>;

export interface RulesConfigResponse {
  id: string;
  season: string;
  league: string;
  rules: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AthleteValidationResponse {
  athleteId: string;
  rulesConfigId: string;
  season: string;
  league: string;
  eligible: boolean;
  violations: Array<{ code: string; message: string; field?: string }>;
  validatedAt: string;
}
