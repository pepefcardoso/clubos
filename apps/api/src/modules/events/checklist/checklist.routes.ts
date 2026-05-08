import type { FastifyInstance } from "fastify";
import { ToggleChecklistItemSchema } from "./checklist.schema.js";
import { listChecklist, toggleChecklistItem } from "./checklist.service.js";
import { NotFoundError } from "../../../lib/errors.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";

export async function checklistRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { eventId: string } }>(
    "/:eventId/checklist",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { eventId } = request.params;
      const { clubId } = request.user as AccessTokenPayload;

      try {
        const result = await listChecklist(fastify.prisma, clubId, eventId);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  fastify.patch<{ Params: { eventId: string; itemId: string } }>(
    "/:eventId/checklist/:itemId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { eventId, itemId } = request.params;
      const { clubId, sub: actorId } = request.user as AccessTokenPayload;

      const parsed = ToggleChecklistItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
        });
      }

      try {
        const item = await toggleChecklistItem(
          fastify.prisma,
          clubId,
          eventId,
          itemId,
          parsed.data,
          actorId,
        );
        return reply.status(200).send(item);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
