import type {
  RuleSet,
  AthleteSnapshot,
  ContractSnapshot,
  ValidationResult,
  RuleViolation,
} from "./rules.types.js";

/**
 * Calculates the age of an athlete in full years at a given reference date.
 * Accounts for whether the birthday has occurred yet in the reference year.
 *
 * Used to validate formative/amateur age limits.
 */
export function calculateAgeAtDate(
  birthDate: Date,
  referenceDate: Date,
): number {
  const years = referenceDate.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    referenceDate.getMonth() > birthDate.getMonth() ||
    (referenceDate.getMonth() === birthDate.getMonth() &&
      referenceDate.getDate() >= birthDate.getDate());
  return hasHadBirthdayThisYear ? years : years - 1;
}

/**
 * Calculates the number of full days a contract has been active at the reference date.
 * Returns a non-negative integer; negative values are clamped to 0.
 */
export function contractActiveDays(
  startDate: Date,
  referenceDate: Date,
): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(
    0,
    Math.floor((referenceDate.getTime() - startDate.getTime()) / msPerDay),
  );
}

/**
 * Validates an athlete + active contract against a rule set.
 *
 * Pure function — performs no I/O. The caller (rules-config.service.ts) is
 * responsible for fetching the athlete, their active contract (if any), and
 * the rule set from the DB and passing them here.
 *
 * Validation order:
 *   1. Athlete status (ACTIVE check)
 *   2. Active contract requirement
 *   3. Contract type allowed for escalation
 *   4. BID registration
 *   5. Minimum time contract has been active (minContractActiveDays)
 *   6. Total contract duration (minContractDurationDays)
 *   7. Age limits by contract type (FORMATIVE / AMATEUR)
 *
 * If `requireActiveContract` is true and no contract is provided, the function
 * short-circuits and returns immediately — subsequent contract checks would
 * produce misleading violations against a null object.
 *
 * @param athlete    Athlete snapshot (id, birthDate, status)
 * @param contract   The athlete's current ACTIVE contract, or null if none
 * @param ruleSet    Deserialized RuleSet from rules_config.rules JSONB
 * @param asOf       Reference date for age + contract duration calculations (default: now)
 * @returns          ValidationResult with eligible flag and zero or more violations
 */
export function validateAthleteEligibility(
  athlete: AthleteSnapshot,
  contract: ContractSnapshot | null,
  ruleSet: RuleSet,
  asOf: Date = new Date(),
): ValidationResult {
  const violations: RuleViolation[] = [];

  if (athlete.status !== "ACTIVE") {
    violations.push({
      code: "ATHLETE_NOT_ACTIVE",
      message:
        athlete.status === "INACTIVE"
          ? "Atleta está inativo e não pode ser escalado."
          : "Atleta está suspenso e não pode ser escalado.",
      field: "status",
    });
  }

  if (
    ruleSet.escalationRequirements.requireActiveContract &&
    contract === null
  ) {
    violations.push({
      code: "NO_ACTIVE_CONTRACT",
      message:
        "Atleta não possui contrato ATIVO. Registre um vínculo antes de escalar.",
      field: "contract",
    });

    return { eligible: false, violations };
  }

  if (contract !== null) {
    if (!ruleSet.allowedContractTypesForEscalation.includes(contract.type)) {
      violations.push({
        code: "CONTRACT_TYPE_NOT_ALLOWED",
        message: `Tipo de contrato "${contract.type}" não é permitido para escalação nesta competição.`,
        field: "contract.type",
      });
    }

    if (
      ruleSet.escalationRequirements.requireBidRegistered &&
      !contract.bidRegistered
    ) {
      violations.push({
        code: "BID_NOT_REGISTERED",
        message:
          "Registro BID/CBF não confirmado. Confirme o registro antes de escalar.",
        field: "contract.bidRegistered",
      });
    }

    const activeDays = contractActiveDays(contract.startDate, asOf);
    if (activeDays < ruleSet.escalationRequirements.minContractActiveDays) {
      violations.push({
        code: "CONTRACT_TOO_NEW",
        message:
          `Contrato deve estar ativo por pelo menos ` +
          `${ruleSet.escalationRequirements.minContractActiveDays} dia(s). ` +
          `Ativo há ${activeDays} dia(s).`,
        field: "contract.startDate",
      });
    }

    if (contract.endDate !== null) {
      const totalDays = contractActiveDays(
        contract.startDate,
        contract.endDate,
      );
      if (totalDays < ruleSet.minContractDurationDays) {
        violations.push({
          code: "CONTRACT_DURATION_TOO_SHORT",
          message:
            `Duração do contrato (${totalDays} dias) é inferior ao mínimo ` +
            `exigido de ${ruleSet.minContractDurationDays} dias.`,
          field: "contract.endDate",
        });
      }
    }

    const age = calculateAgeAtDate(athlete.birthDate, asOf);

    if (
      contract.type === "FORMATIVE" &&
      ruleSet.maxAgeFormativeYears !== null &&
      age > ruleSet.maxAgeFormativeYears
    ) {
      violations.push({
        code: "AGE_EXCEEDS_FORMATIVE_LIMIT",
        message:
          `Atleta tem ${age} anos. Contratos FORMATIVOS exigem no máximo ` +
          `${ruleSet.maxAgeFormativeYears} anos.`,
        field: "birthDate",
      });
    }

    if (
      contract.type === "AMATEUR" &&
      ruleSet.maxAgeAmateurYears !== null &&
      age > ruleSet.maxAgeAmateurYears
    ) {
      violations.push({
        code: "AGE_EXCEEDS_AMATEUR_LIMIT",
        message:
          `Atleta tem ${age} anos. Contratos AMADORES exigem no máximo ` +
          `${ruleSet.maxAgeAmateurYears} anos.`,
        field: "birthDate",
      });
    }
  }

  return {
    eligible: violations.length === 0,
    violations,
  };
}
