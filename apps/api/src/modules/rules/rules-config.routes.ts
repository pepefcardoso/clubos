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
import { withTenantSchema } from "../../lib/prisma.js";
import { assertRulesConfigExists } from "../../lib/assert-tenant-ownership.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function rulesConfigRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/rules-config
   * List — no single-resource ID.
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
   */
  fastify.get("/:configId", async (request, reply) => {
    const { configId } = request.params as { configId: string };
    const { clubId } = request.user as AccessTokenPayload;

    try {
      const config = await withTenantSchema(
        fastify.prisma,
        clubId,
        async (tx) => {
          await assertRulesConfigExists(tx, configId);
          return getRulesConfigById(tx, clubId, configId);
        },
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
  });

  /**
   * POST /api/rules-config
   * Create — no existing resource ID.
   * Restricted to ADMIN.
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
   * Restricted to ADMIN.
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
        const config = await withTenantSchema(
          fastify.prisma,
          clubId,
          async (tx) => {
            await assertRulesConfigExists(tx, configId);
            return updateRulesConfig(tx, clubId, configId, parsed.data);
          },
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
      const result = await withTenantSchema(
        fastify.prisma,
        clubId,
        async (tx) => {
          await assertRulesConfigExists(tx, configId);
          return validateAthleteAgainstRuleSet(
            tx,
            clubId,
            configId,
            parsed.data.athleteId,
          );
        },
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
