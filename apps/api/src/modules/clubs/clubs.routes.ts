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
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function clubRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/clubs
   * Creates a new club and provisions its tenant PostgreSQL schema.
   * Public endpoint — no JWT required (called during onboarding).
   *
   * Optional `adminEmail` field: when provided, a welcome email is sent
   * via Resend after provisioning succeeds (fire-and-forget).
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
   * Uploads, resizes (200×200px WebP), and persists the club's logo.
   * The authenticated user's clubId (from JWT) must match the :clubId param —
   * this enforces the tenant boundary without a separate DB lookup.
   *
   * Authorization: Bearer token required (ADMIN role).
   * Content-Type: multipart/form-data (field name: "file")
   * Max file size: 5 MB
   * Accepted formats: JPEG, PNG, WebP, GIF
   *
   * Responses:
   *   200 { logoUrl }  — upload successful
   *   400             — missing file or multipart parse error
   *   401             — missing / expired access token
   *   403             — authenticated user is not ADMIN
   *   404             — clubId not found or belongs to another tenant
   *   422             — unsupported format or corrupt image
   */
  fastify.post(
    "/:clubId/logo",
    {
      preHandler: [fastify.verifyAccessToken, fastify.requireRole("ADMIN")],
    },
    async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const user = request.user as AccessTokenPayload;

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
