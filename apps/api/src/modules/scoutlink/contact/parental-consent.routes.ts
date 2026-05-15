import type { FastifyInstance } from "fastify";
import type { AccessTokenPayload } from "../../../types/fastify.js";
import { getPrismaClient } from "../../../lib/prisma.js";
import {
  ParentalConsentParamsSchema,
  RecordParentalConsentSchema,
} from "./parental-consent.schema.js";
import {
  getParentalConsentStatus,
  recordParentalConsent,
} from "./parental-consent.service.js";

export async function parentalConsentRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const prisma = getPrismaClient();

  fastify.post<{ Params: { athleteId: string } }>(
    "/:athleteId/parental-consent",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { clubId, sub: actorId } = request.user as AccessTokenPayload;

      if (!clubId) {
        return reply.code(400).send({
          message:
            "O clubId é obrigatório e não foi encontrado no token do utilizador.",
        });
      }

      const { athleteId } = ParentalConsentParamsSchema.parse(request.params);
      const input = RecordParentalConsentSchema.parse(request.body);

      const result = await recordParentalConsent(
        prisma,
        clubId,
        actorId,
        athleteId,
        input,
        request.ip,
      );

      return reply.code(201).send(result);
    },
  );

  fastify.get<{ Params: { athleteId: string } }>(
    "/:athleteId/parental-consent",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { clubId } = request.user as AccessTokenPayload;

      if (!clubId) {
        return reply.code(400).send({
          message:
            "O clubId é obrigatório e não foi encontrado no token do utilizador.",
        });
      }

      const { athleteId } = ParentalConsentParamsSchema.parse(request.params);

      const result = await getParentalConsentStatus(prisma, clubId, athleteId);
      return reply.send(result);
    },
  );
}
