import type { FastifyInstance } from "fastify";
import { subscribe, getStatus } from "./scout-billing.service.js";

/**
 * Scout billing routes — SCOUT role required on all endpoints.
 * scoutId is always read from JWT (never body or query). [SEC-OBJ]
 */
export async function scoutBillingRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const prisma = fastify.prisma;

  fastify.post(
    "/subscribe",
    {
      onRequest: [fastify.verifyAccessToken],
      preHandler: [fastify.requireRole("SCOUT")],
      schema: { tags: ["scout-billing"] } as any,
    },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const result = await subscribe(prisma, user.sub);

      return reply.status(201).send(result);
    },
  );

  fastify.get(
    "/status",
    {
      onRequest: [fastify.verifyAccessToken],
      preHandler: [fastify.requireRole("SCOUT")],
      schema: { tags: ["scout-billing"] } as any,
    },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const result = await getStatus(prisma, user.sub);

      return reply.status(200).send(result);
    },
  );
}
