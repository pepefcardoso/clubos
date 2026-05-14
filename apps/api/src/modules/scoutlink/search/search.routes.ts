import type { FastifyInstance } from "fastify";
import {
  AthleteProfileParamsSchema,
  SearchAthletesQuerySchema,
} from "./search.schema.js";
import { getAthletePublicProfile, searchAthletes } from "./search.service.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";

export async function scoutSearchRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    "/",
    { preHandler: [fastify.verifyAccessToken, fastify.requireRole("SCOUT")] },
    async (request, reply) => {
      const parsed = SearchAthletesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid query params",
        });
      }

      const user = request.user as AccessTokenPayload;
      const result = await searchAthletes(
        fastify.prisma,
        user.sub,
        parsed.data,
      );
      return reply.status(200).send(result);
    },
  );

  fastify.get(
    "/:showcaseId",
    { preHandler: [fastify.verifyAccessToken, fastify.requireRole("SCOUT")] },
    async (request, reply) => {
      const params = AthleteProfileParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: params.error.issues[0]?.message ?? "Invalid params",
        });
      }

      const user = request.user as AccessTokenPayload;
      const profile = await getAthletePublicProfile(
        fastify.prisma,
        user.sub,
        params.data.showcaseId,
      );

      if (!profile) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Perfil não encontrado.",
        });
      }

      return reply.status(200).send(profile);
    },
  );
}
