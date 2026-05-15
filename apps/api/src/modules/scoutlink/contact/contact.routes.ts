import type { FastifyInstance } from "fastify";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../lib/errors.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";
import { CreateContactRequestSchema } from "./contact.schema.js";
import { createContactRequest } from "./contact.service.js";

export async function contactRequestRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post(
    "/",
    { preHandler: [fastify.verifyAccessToken, fastify.requireRole("SCOUT")] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;

      const parsed = CreateContactRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const ip =
        (request.headers["x-forwarded-for"] as string | undefined)
          ?.split(",")[0]
          ?.trim() ?? request.ip;

      try {
        const result = await createContactRequest(
          fastify.prisma,
          user.sub,
          parsed.data,
          ip,
        );
        return reply.status(201).send(result);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (err instanceof ForbiddenError) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
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
