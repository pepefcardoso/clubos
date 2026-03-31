import type { FastifyInstance } from "fastify";
import {
  CreateExerciseSchema,
  UpdateExerciseSchema,
  ListExercisesQuerySchema,
} from "./exercises.schema.js";
import {
  createExercise,
  getExerciseById,
  updateExercise,
  deleteExercise,
  listExercises,
  ExerciseNotFoundError,
  ExerciseInUseError,
} from "./exercises.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function exerciseRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/exercises
   * List exercises — accessible by all authenticated roles.
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListExercisesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;
    const result = await listExercises(fastify.prisma, clubId, parsed.data);
    return reply.status(200).send(result);
  });

  /**
   * POST /api/exercises
   * Create — ADMIN only.
   */
  fastify.post(
    "/",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateExerciseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;
      const exercise = await createExercise(
        fastify.prisma,
        clubId,
        request.actorId,
        parsed.data,
      );
      return reply.status(201).send(exercise);
    },
  );

  /**
   * GET /api/exercises/:exerciseId
   * Read — accessible by all authenticated roles.
   */
  fastify.get("/:exerciseId", async (request, reply) => {
    const { exerciseId } = request.params as { exerciseId: string };
    const { clubId } = request.user as AccessTokenPayload;

    try {
      const exercise = await getExerciseById(
        fastify.prisma,
        clubId,
        exerciseId,
      );
      return reply.status(200).send(exercise);
    } catch (err) {
      if (err instanceof ExerciseNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Exercício não encontrado",
        });
      }
      throw err;
    }
  });

  /**
   * PUT /api/exercises/:exerciseId
   * Update — ADMIN only.
   */
  fastify.put(
    "/:exerciseId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { exerciseId } = request.params as { exerciseId: string };

      const parsed = UpdateExerciseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const exercise = await updateExercise(
          fastify.prisma,
          clubId,
          request.actorId,
          exerciseId,
          parsed.data,
        );
        return reply.status(200).send(exercise);
      } catch (err) {
        if (err instanceof ExerciseNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Exercício não encontrado",
          });
        }
        throw err;
      }
    },
  );

  /**
   * DELETE /api/exercises/:exerciseId
   * Soft-delete — ADMIN only.
   * Returns 409 if the exercise is referenced by any session_exercises rows.
   */
  fastify.delete(
    "/:exerciseId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { exerciseId } = request.params as { exerciseId: string };
      const { clubId } = request.user as AccessTokenPayload;

      try {
        await deleteExercise(
          fastify.prisma,
          clubId,
          request.actorId,
          exerciseId,
        );
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof ExerciseNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Exercício não encontrado",
          });
        }
        if (err instanceof ExerciseInUseError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: "Exercício está vinculado a sessões existentes",
          });
        }
        throw err;
      }
    },
  );
}
