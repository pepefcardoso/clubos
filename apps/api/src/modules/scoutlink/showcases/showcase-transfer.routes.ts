import type { FastifyInstance } from "fastify";
import type { AccessTokenPayload } from "../../../types/fastify.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../lib/errors.js";
import { ShowcaseAthleteParamsSchema } from "./showcases.schema.js";
import { TransferShowcaseBodySchema } from "./showcase-transfer.schema.js";
import { transferShowcase } from "./showcase-transfer.service.js";

export async function showcaseTransferRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post(
    "/:athleteId/showcase/transfer",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const params = ShowcaseAthleteParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: params.error.issues[0]?.message ?? "Invalid params",
        });
      }

      const body = TransferShowcaseBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: body.error.issues[0]?.message ?? "Invalid body",
        });
      }

      const user = request.user as AccessTokenPayload;

      try {
        const result = await transferShowcase(
          fastify.prisma,
          user.clubId!,
          params.data.athleteId,
          user.sub,
          body.data,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof NotFoundError)
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        if (err instanceof ConflictError)
          return reply
            .status(409)
            .send({ statusCode: 409, error: "Conflict", message: err.message });
        if (err instanceof ForbiddenError)
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: err.message,
          });
        throw err;
      }
    },
  );
}
