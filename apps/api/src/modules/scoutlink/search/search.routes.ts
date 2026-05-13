import type { FastifyInstance } from "fastify";
import { SearchAthletesQuerySchema } from "./search.schema.js";
import { searchAthletes } from "./search.service.js";
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
}
