import type { FastifyInstance } from "fastify";
import { CreateClubSchema } from "./clubs.schema.js";
import {
  createClub,
  uploadClubLogo,
  DuplicateSlugError,
  DuplicateCnpjError,
  ClubNotFoundError,
  InvalidImageError,
} from "./clubs.service.js";
import { assertClubBelongsToUser } from "../../lib/assert-tenant-ownership.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function clubRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/clubs
   * Public endpoint — creates a club during onboarding. No JWT required.
   */
  fastify.post("/", async (request, reply) => {
    const parsed = CreateClubSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    try {
      const club = await createClub(
        fastify.prisma,
        parsed.data,
        parsed.data.adminEmail,
      );
      return reply.status(201).send(club);
    } catch (err) {
      if (err instanceof DuplicateSlugError) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Um clube com este slug já está cadastrado",
        });
      }
      if (err instanceof DuplicateCnpjError) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Um clube com este CNPJ já está cadastrado",
        });
      }
      throw err;
    }
  });

  /**
   * POST /api/clubs/:clubId/logo
   *
   * L-04: assertClubBelongsToUser ensures the :clubId param equals the
   * authenticated user's clubId from the JWT. An admin from Club A cannot
   * overwrite Club B's logo by guessing its ID.
   *
   * Authorization: ADMIN role required.
   */
  fastify.post(
    "/:clubId/logo",
    {
      preHandler: [fastify.verifyAccessToken, fastify.requireRole("ADMIN")],
    },
    async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const user = request.user as AccessTokenPayload;

      try {
        await assertClubBelongsToUser(fastify.prisma, clubId, user.clubId);
      } catch {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Clube não encontrado",
        });
      }

      let data;
      try {
        data = await request.file();
      } catch (err) {
        const error = err as { statusCode?: number };
        if (error.statusCode === 413) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Arquivo excede o limite de 5 MB",
          });
        }
        throw err;
      }

      if (!data) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Nenhuma imagem enviada",
        });
      }

      let buffer: Buffer;
      try {
        buffer = await data.toBuffer();
      } catch (err) {
        const error = err as { statusCode?: number };
        if (error.statusCode === 413) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Arquivo excede o limite de 5 MB",
          });
        }
        throw err;
      }

      try {
        const result = await uploadClubLogo(
          fastify.prisma,
          clubId,
          user.clubId,
          data.mimetype,
          buffer,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof ClubNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Clube não encontrado",
          });
        }
        if (err instanceof InvalidImageError) {
          return reply.status(422).send({
            statusCode: 422,
            error: "Unprocessable Entity",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
