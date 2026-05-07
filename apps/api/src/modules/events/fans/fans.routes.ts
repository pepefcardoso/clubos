import type { FastifyInstance } from "fastify";
import { ListFansQuerySchema } from "./fans.schema.js";
import { listFans } from "./fans.service.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";

export async function fansRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/",
    { preHandler: [fastify.requireRole("ADMIN", "TREASURER")] },
    async (request, reply) => {
      const parsed = ListFansQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid query params",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;
      const result = await listFans(fastify.prisma, clubId, parsed.data);
      return reply.status(200).send(result);
    },
  );
}
