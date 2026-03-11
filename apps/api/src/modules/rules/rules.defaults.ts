import type { RuleSet } from "./rules.types.js";

/**
 * CBF 2025 defaults — based on Regulamento Geral de Competições da CBF.
 * Clubs can override individual fields via PUT /api/rules-config/:id.
 *
 * Key rules encoded:
 *   - FORMATIVE contracts: max age 20 years
 *   - AMATEUR contracts: max age 23 years
 *   - All four contract types allowed for escalation
 *   - BID registration is mandatory before escalation
 *   - Contract must be ACTIVE for at least 1 day
 *   - Minimum contract duration: 30 days
 */
export const DEFAULT_CBF_RULES: RuleSet = {
  maxAgeFormativeYears: 20,
  maxAgeAmateurYears: 23,
  minContractDurationDays: 30,
  allowedContractTypesForEscalation: [
    "PROFESSIONAL",
    "AMATEUR",
    "FORMATIVE",
    "LOAN",
  ],
  escalationRequirements: {
    requireBidRegistered: true,
    requireActiveContract: true,
    minContractActiveDays: 1,
  },
};
