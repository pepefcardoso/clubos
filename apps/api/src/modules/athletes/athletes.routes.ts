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
import type { AccessTokenPayload } from "../../types/fastify.js";

/**
 * Fastify plugin that registers athlete CRUD routes under the prefix
 * configured in protectedRoutes (e.g. /api/athletes).
 *
 * All routes are protected by verifyAccessToken via the protectedRoutes
 * plugin-level hook — no additional auth setup needed here.
 *
 */
export async function athleteRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/athletes
   * Returns a paginated, filterable list of athletes for the authenticated club.
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
   * Creates a single athlete for the authenticated club.
   * Accessible by both ADMIN and TREASURER.
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
   * Returns a single athlete by id.
   * Accessible by both ADMIN and TREASURER.
   */
  fastify.get("/:athleteId", async (request, reply) => {
    const { athleteId } = request.params as { athleteId: string };
    const user = request.user as AccessTokenPayload;

    try {
      const athlete = await getAthleteById(
        fastify.prisma,
        user.clubId,
        athleteId,
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
   * Partially updates an athlete. Supports: name, birthDate, position, status.
   * CPF is immutable — intentionally absent from the update schema.
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
        const athlete = await updateAthlete(
          fastify.prisma,
          user.clubId,
          request.actorId,
          athleteId,
          parsed.data,
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
