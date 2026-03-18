import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  withTenantSchema,
  isPrismaUniqueConstraintError,
} from "../../lib/prisma.js";
import { validateAthleteEligibility } from "./rules-validator.js";
import { RuleSetSchema } from "./rules-config.schema.js";
import type {
  CreateRulesConfigInput,
  UpdateRulesConfigInput,
  RulesConfigResponse,
  AthleteValidationResponse,
} from "./rules-config.schema.js";
import type { ContractSnapshot, AthleteSnapshot } from "./rules.types.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";

export class RulesConfigNotFoundError extends NotFoundError {
  constructor() {
    super("Configuração de regras não encontrada");
  }
}

export class DuplicateRulesConfigError extends ConflictError {
  constructor() {
    super("Já existe uma configuração de regras para esta temporada e liga.");
  }
}

export class RulesConfigAthleteNotFoundError extends NotFoundError {
  constructor() {
    super("Atleta não encontrado");
  }
}

type RulesConfigRow = {
  id: string;
  season: string;
  league: string;
  rules: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toResponse(config: RulesConfigRow): RulesConfigResponse {
  return {
    id: config.id,
    season: config.season,
    league: config.league,
    rules: config.rules,
    isActive: config.isActive,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

/**
 * Creates a new rules_config row in the tenant schema.
 * Throws DuplicateRulesConfigError if a config for (season, league) already exists.
 */
export async function createRulesConfig(
  prisma: PrismaClient,
  clubId: string,
  input: CreateRulesConfigInput,
): Promise<RulesConfigResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    try {
      const config = await tx.rulesConfig.create({
        data: {
          season: input.season,
          league: input.league,
          rules: input.rules,
          isActive: input.isActive,
          updatedAt: new Date(),
        },
      });
      return toResponse(config);
    } catch (err) {
      if (isPrismaUniqueConstraintError(err))
        throw new DuplicateRulesConfigError();
      throw err;
    }
  });
}

/**
 * Returns all rules_config rows for a club, ordered by season desc then league asc.
 * Pass `onlyActive = true` to filter to isActive = true rows only.
 */
export async function listRulesConfigs(
  prisma: PrismaClient,
  clubId: string,
  onlyActive = false,
): Promise<RulesConfigResponse[]> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const rows = await tx.rulesConfig.findMany({
      ...(onlyActive ? { where: { isActive: true } } : {}),
      orderBy: [{ season: "desc" }, { league: "asc" }],
    });
    return rows.map(toResponse);
  });
}

/**
 * Returns a single rules_config by id.
 * Throws RulesConfigNotFoundError if no record exists.
 */
export async function getRulesConfigById(
  prisma: PrismaClient,
  clubId: string,
  id: string,
): Promise<RulesConfigResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const config = await tx.rulesConfig.findUnique({ where: { id } });
    if (!config) throw new RulesConfigNotFoundError();
    return toResponse(config);
  });
}

/**
 * Partially updates a rules_config row (rules JSONB and/or isActive flag).
 * season and league are immutable post-creation.
 * Throws RulesConfigNotFoundError if no record exists.
 */
export async function updateRulesConfig(
  prisma: PrismaClient,
  clubId: string,
  id: string,
  input: UpdateRulesConfigInput,
): Promise<RulesConfigResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.rulesConfig.findUnique({ where: { id } });
    if (!existing) throw new RulesConfigNotFoundError();

    const updated = await tx.rulesConfig.update({
      where: { id },
      data: {
        ...(input.rules !== undefined ? { rules: input.rules } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedAt: new Date(),
      },
    });
    return toResponse(updated);
  });
}

/**
 * Validates an athlete's escalation eligibility against a specific rule set.
 *
 * Orchestration steps:
 *   1. Fetch the rules_config and athlete in parallel.
 *   2. Re-parse the JSONB `rules` column through RuleSetSchema — this prevents
 *      corrupt or hand-edited JSONB from reaching the pure validator.
 *   3. Fetch the athlete's current ACTIVE contract (most recent by startDate).
 *   4. Call the pure validateAthleteEligibility function.
 *   5. Return a structured AthleteValidationResponse.
 *
 * The `asOf` parameter is injectable for deterministic unit testing.
 *
 * Throws:
 *   - RulesConfigNotFoundError   — if rulesConfigId does not exist
 *   - RulesConfigAthleteNotFoundError — if athleteId does not exist
 *   - ZodError                   — if the stored JSONB fails RuleSetSchema validation
 *     (this surfaces a data integrity problem that requires admin attention)
 */
export async function validateAthleteAgainstRuleSet(
  prisma: PrismaClient,
  clubId: string,
  rulesConfigId: string,
  athleteId: string,
  asOf: Date = new Date(),
): Promise<AthleteValidationResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const [config, athlete] = await Promise.all([
      tx.rulesConfig.findUnique({ where: { id: rulesConfigId } }),
      tx.athlete.findUnique({ where: { id: athleteId } }),
    ]);

    if (!config) throw new RulesConfigNotFoundError();
    if (!athlete) throw new RulesConfigAthleteNotFoundError();

    const parsedRules = RuleSetSchema.parse(config.rules);

    const activeContract = await tx.contract.findFirst({
      where: { athleteId, status: "ACTIVE" },
      orderBy: { startDate: "desc" },
    });

    const athleteSnapshot: AthleteSnapshot = {
      id: athlete.id,
      birthDate: athlete.birthDate,
      status: athlete.status as AthleteSnapshot["status"],
    };

    const contractSnapshot: ContractSnapshot | null = activeContract
      ? {
          id: activeContract.id,
          type: activeContract.type as ContractSnapshot["type"],
          status: activeContract.status as ContractSnapshot["status"],
          startDate: activeContract.startDate,
          endDate: activeContract.endDate,
          bidRegistered: activeContract.bidRegistered,
        }
      : null;

    const result = validateAthleteEligibility(
      athleteSnapshot,
      contractSnapshot,
      parsedRules,
      asOf,
    );

    return {
      athleteId,
      rulesConfigId,
      season: config.season,
      league: config.league,
      eligible: result.eligible,
      violations: result.violations,
      validatedAt: asOf.toISOString(),
    };
  });
}
