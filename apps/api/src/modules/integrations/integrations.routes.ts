import type { FastifyInstance } from "fastify";
import { CreateIntegrationTokenSchema } from "./integrations.schema.js";
import {
  createIntegrationToken,
  revokeIntegrationToken,
  listIntegrationTokens,
} from "./integrations.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function integrationRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/integrations/tokens
   * Lists all integration tokens for the authenticated club (with athlete names).
   * ADMIN only.
   */
  fastify.get(
    "/tokens",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { clubId } = request.user as AccessTokenPayload;
      const tokens = await listIntegrationTokens(fastify.prisma, clubId);
      return reply.status(200).send({ data: tokens, total: tokens.length });
    },
  );

  /**
   * POST /api/integrations/tokens
   * Creates a new integration token for an athlete.
   * Returns the plain token ONCE — not retrievable afterwards.
   * ADMIN only.
   */
  fastify.post(
    "/tokens",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateIntegrationTokenSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;
      const result = await createIntegrationToken(
        fastify.prisma,
        clubId,
        request.actorId,
        parsed.data,
      );
      return reply.status(201).send(result);
    },
  );

  /**
   * DELETE /api/integrations/tokens/:tokenId
   * Revokes an integration token. Soft-delete only — row preserved for audit.
   * ADMIN only.
   */
  fastify.delete(
    "/tokens/:tokenId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { tokenId } = request.params as { tokenId: string };
      const { clubId } = request.user as AccessTokenPayload;

      await revokeIntegrationToken(
        fastify.prisma,
        clubId,
        request.actorId,
        tokenId,
      );
      return reply.status(204).send();
    },
  );
}
