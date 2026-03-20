import type { FastifyInstance } from "fastify";
import {
  CreateAthleteSchema,
  UpdateAthleteSchema,
  ListAthletesQuerySchema,
} from "./athletes.schema.js";
import {
  createAthlete,
  listAthletes,
  getAthleteById,
  updateAthlete,
  DuplicateAthleteCpfError,
  AthleteNotFoundError,
} from "./athletes.service.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { assertAthleteExists } from "../../lib/assert-tenant-ownership.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function athleteRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/athletes
   * List — no single-resource ID.
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListAthletesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const user = request.user as AccessTokenPayload;
    const result = await listAthletes(fastify.prisma, user.clubId, parsed.data);
    return reply.status(200).send(result);
  });

  /**
   * POST /api/athletes
   * Create — no existing resource ID.
   */
  fastify.post("/", async (request, reply) => {
    const parsed = CreateAthleteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const user = request.user as AccessTokenPayload;

    try {
      const athlete = await createAthlete(
        fastify.prisma,
        user.clubId,
        request.actorId,
        parsed.data,
      );
      return reply.status(201).send(athlete);
    } catch (err) {
      if (err instanceof DuplicateAthleteCpfError) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Atleta com este CPF já está cadastrado",
        });
      }
      throw err;
    }
  });

  /**
   * GET /api/athletes/:athleteId
   */
  fastify.get("/:athleteId", async (request, reply) => {
    const { athleteId } = request.params as { athleteId: string };
    const user = request.user as AccessTokenPayload;

    try {
      const athlete = await withTenantSchema(
        fastify.prisma,
        user.clubId,
        async (tx) => {
          await assertAthleteExists(tx, athleteId);
          return getAthleteById(tx, user.clubId, athleteId);
        },
      );
      return reply.status(200).send(athlete);
    } catch (err) {
      if (err instanceof AthleteNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Atleta não encontrado",
        });
      }
      throw err;
    }
  });

  /**
   * PUT /api/athletes/:athleteId
   * Restricted to ADMIN role.
   */
  fastify.put(
    "/:athleteId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { athleteId } = request.params as { athleteId: string };

      const parsed = UpdateAthleteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const user = request.user as AccessTokenPayload;

      try {
        const athlete = await withTenantSchema(
          fastify.prisma,
          user.clubId,
          async (tx) => {
            await assertAthleteExists(tx, athleteId);
            return updateAthlete(
              tx,
              user.clubId,
              request.actorId,
              athleteId,
              parsed.data,
            );
          },
        );
        return reply.status(200).send(athlete);
      } catch (err) {
        if (err instanceof AthleteNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Atleta não encontrado",
          });
        }
        throw err;
      }
    },
  );
}
