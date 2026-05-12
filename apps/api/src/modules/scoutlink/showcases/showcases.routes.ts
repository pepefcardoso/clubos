import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AccessTokenPayload } from "../../../types/fastify.js";
import {
  PublishShowcaseBodySchema,
  ShowcaseAthleteParamsSchema,
} from "./showcases.schema.js";
import {
  publishShowcase,
  getShowcaseForAdmin,
  getShowcaseForScout,
} from "./showcases.service.js";
import { NotFoundError } from "../../../lib/errors.js";

export async function showcaseRoutes(fastify: FastifyInstance): Promise<void> {
  const { prisma } = fastify;

  fastify.post(
    "/:athleteId/showcase",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = ShowcaseAthleteParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: params.error.issues[0]?.message ?? "Invalid params",
        });
      }

      const body = PublishShowcaseBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: body.error.issues[0]?.message ?? "Invalid body",
        });
      }

      const user = request.user as AccessTokenPayload;

      const showcase = await publishShowcase(
        prisma,
        user.clubId!,
        params.data.athleteId,
        user.sub,
        body.data.tier,
      );

      return reply.status(201).send(showcase);
    },
  );

  fastify.get(
    "/:athleteId/showcase",
    { preHandler: [fastify.verifyAccessToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as AccessTokenPayload;

      if (user.role !== "ADMIN" && user.role !== "SCOUT") {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Acesso negado.",
        });
      }

      const params = ShowcaseAthleteParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: params.error.issues[0]?.message ?? "Invalid params",
        });
      }

      const { athleteId } = params.data;
      let showcase;

      if (user.role === "ADMIN") {
        showcase = await getShowcaseForAdmin(prisma, user.clubId!, athleteId);
      } else {
        showcase = await getShowcaseForScout(prisma, athleteId);
      }

      if (!showcase) {
        throw new NotFoundError("Showcase não encontrado.");
      }

      return reply.status(200).send(showcase);
    },
  );
}
