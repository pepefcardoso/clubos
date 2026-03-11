import type { FastifyInstance } from "fastify";
import {
  CreateRulesConfigSchema,
  UpdateRulesConfigSchema,
  ValidateAthleteQuerySchema,
} from "./rules-config.schema.js";
import {
  createRulesConfig,
  listRulesConfigs,
  getRulesConfigById,
  updateRulesConfig,
  validateAthleteAgainstRuleSet,
  RulesConfigNotFoundError,
  DuplicateRulesConfigError,
  RulesConfigAthleteNotFoundError,
} from "./rules-config.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

/**
 * Fastify plugin that registers rules-config CRUD routes under the prefix
 * configured in protectedRoutes (e.g. /api/rules-config).
 *
 * All routes are protected by verifyAccessToken via the protectedRoutes
 * plugin-level hook — no additional auth setup needed here.
 *
 * RBAC:
 *   GET  /                  → ADMIN + TREASURER
 *   GET  /:configId         → ADMIN + TREASURER
 *   POST /                  → ADMIN only
 *   PUT  /:configId         → ADMIN only
 *   POST /:configId/validate → ADMIN + TREASURER
 */
export async function rulesConfigRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/rules-config
   * Returns all rule sets for the authenticated club.
   * Pass ?onlyActive=true to filter to active rule sets only.
   */
  fastify.get("/", async (request, reply) => {
    const { clubId } = request.user as AccessTokenPayload;
    const query = request.query as { onlyActive?: string };
    const onlyActive = query.onlyActive === "true";

    const result = await listRulesConfigs(fastify.prisma, clubId, onlyActive);
    return reply.status(200).send(result);
  });

  /**
   * GET /api/rules-config/:configId
   * Returns a single rule set by id.
   * Accessible by both ADMIN and TREASURER.
   */
  fastify.get("/:configId", async (request, reply) => {
    const { configId } = request.params as { configId: string };
    const { clubId } = request.user as AccessTokenPayload;

    try {
      const config = await getRulesConfigById(fastify.prisma, clubId, configId);
      return reply.status(200).send(config);
    } catch (err) {
      if (err instanceof RulesConfigNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Configuração de regras não encontrada",
        });
      }
      throw err;
    }
  });

  /**
   * POST /api/rules-config
   * Creates a new rule set for the authenticated club.
   * Restricted to ADMIN role.
   *
   * Returns:
   *   201 — created rule set
   *   400 — invalid body
   *   403 — insufficient role (TREASURER)
   *   409 — rule set for this (season, league) already exists
   */
  fastify.post(
    "/",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateRulesConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const config = await createRulesConfig(
          fastify.prisma,
          clubId,
          parsed.data,
        );
        return reply.status(201).send(config);
      } catch (err) {
        if (err instanceof DuplicateRulesConfigError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: "Já existe uma configuração para esta temporada e liga",
          });
        }
        throw err;
      }
    },
  );

  /**
   * PUT /api/rules-config/:configId
   * Partially updates a rule set (rules JSONB and/or isActive toggle).
   * season and league are immutable post-creation — excluded from the schema.
   * Restricted to ADMIN role.
   *
   * Returns:
   *   200 — updated rule set
   *   400 — invalid body
   *   403 — insufficient role (TREASURER)
   *   404 — rule set not found
   */
  fastify.put(
    "/:configId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { configId } = request.params as { configId: string };

      const parsed = UpdateRulesConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const config = await updateRulesConfig(
          fastify.prisma,
          clubId,
          configId,
          parsed.data,
        );
        return reply.status(200).send(config);
      } catch (err) {
        if (err instanceof RulesConfigNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Configuração de regras não encontrada",
          });
        }
        throw err;
      }
    },
  );

  /**
   * POST /api/rules-config/:configId/validate
   * On-demand eligibility check: validates a specific athlete against this rule set.
   * Accessible by both ADMIN and TREASURER.
   *
   * Body: { athleteId: string }
   *
   * Returns:
   *   200 — validation result (eligible flag + violations array)
   *   400 — missing athleteId
   *   404 — rule set or athlete not found
   */
  fastify.post("/:configId/validate", async (request, reply) => {
    const { configId } = request.params as { configId: string };

    const parsed = ValidateAthleteQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "athleteId é obrigatório",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;

    try {
      const result = await validateAthleteAgainstRuleSet(
        fastify.prisma,
        clubId,
        configId,
        parsed.data.athleteId,
      );
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof RulesConfigNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Configuração de regras não encontrada",
        });
      }
      if (err instanceof RulesConfigAthleteNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Atleta não encontrado",
        });
      }
      throw err;
    }
  });
}
