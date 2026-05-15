import type { FastifyInstance } from "fastify";
import { ConflictError, NotFoundError } from "../../../lib/errors.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";
import { RespondContactRequestSchema } from "./contact-response.schema.js";
import { respondToContactRequest } from "./contact-response.service.js";

export async function contactResponseRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.patch<{ Params: { contactRequestId: string } }>(
    "/:contactRequestId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { contactRequestId } = request.params;
      const user = request.user as AccessTokenPayload;

      const parsed = RespondContactRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
        });
      }

      const ip =
        (request.headers["x-forwarded-for"] as string | undefined)
          ?.split(",")[0]
          ?.trim() ?? request.ip;

      try {
        const result = await respondToContactRequest(
          fastify.prisma,
          contactRequestId,
          user.clubId!,
          user.sub,
          parsed.data,
          ip,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (err instanceof ConflictError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
