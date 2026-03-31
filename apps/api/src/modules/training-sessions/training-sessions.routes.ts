import type { FastifyInstance } from "fastify";
import {
  CreateTrainingSessionSchema,
  UpdateTrainingSessionSchema,
  ListTrainingSessionsQuerySchema,
  AddSessionExerciseSchema,
} from "./training-sessions.schema.js";
import {
  createTrainingSession,
  getTrainingSessionById,
  updateTrainingSession,
  deleteTrainingSession,
  listTrainingSessions,
  addExerciseToSession,
  removeExerciseFromSession,
  TrainingSessionNotFoundError,
  TrainingSessionCompletedError,
  ExerciseNotFoundError,
  SessionExerciseNotFoundError,
} from "./training-sessions.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function trainingSessionRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/training-sessions
   * List — accessible by all authenticated roles.
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListTrainingSessionsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;
    const result = await listTrainingSessions(
      fastify.prisma,
      clubId,
      parsed.data,
    );
    return reply.status(200).send(result);
  });

  /**
   * POST /api/training-sessions
   * Create — ADMIN only.
   */
  fastify.post(
    "/",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateTrainingSessionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const session = await createTrainingSession(
          fastify.prisma,
          clubId,
          request.actorId,
          parsed.data,
        );
        return reply.status(201).send(session);
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
   * GET /api/training-sessions/:sessionId
   * Read — accessible by all authenticated roles.
   */
  fastify.get("/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { clubId } = request.user as AccessTokenPayload;

    try {
      const session = await getTrainingSessionById(
        fastify.prisma,
        clubId,
        sessionId,
      );
      return reply.status(200).send(session);
    } catch (err) {
      if (err instanceof TrainingSessionNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Sessão de treino não encontrada",
        });
      }
      throw err;
    }
  });

  /**
   * PUT /api/training-sessions/:sessionId
   * Update — ADMIN only.
   */
  fastify.put(
    "/:sessionId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };

      const parsed = UpdateTrainingSessionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const session = await updateTrainingSession(
          fastify.prisma,
          clubId,
          request.actorId,
          sessionId,
          parsed.data,
        );
        return reply.status(200).send(session);
      } catch (err) {
        if (err instanceof TrainingSessionNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Sessão de treino não encontrada",
          });
        }
        throw err;
      }
    },
  );

  /**
   * DELETE /api/training-sessions/:sessionId
   * Delete (hard) — ADMIN only.
   * Returns 409 if session is completed (immutable historical record).
   */
  fastify.delete(
    "/:sessionId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const { clubId } = request.user as AccessTokenPayload;

      try {
        await deleteTrainingSession(
          fastify.prisma,
          clubId,
          request.actorId,
          sessionId,
        );
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof TrainingSessionNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Sessão de treino não encontrada",
          });
        }
        if (err instanceof TrainingSessionCompletedError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: "Sessões concluídas não podem ser excluídas",
          });
        }
        throw err;
      }
    },
  );

  /**
   * POST /api/training-sessions/:sessionId/exercises
   * Add (or update) an exercise in a session — ADMIN only.
   */
  fastify.post(
    "/:sessionId/exercises",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };

      const parsed = AddSessionExerciseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const session = await addExerciseToSession(
          fastify.prisma,
          clubId,
          sessionId,
          parsed.data,
        );
        return reply.status(200).send(session);
      } catch (err) {
        if (err instanceof TrainingSessionNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Sessão de treino não encontrada",
          });
        }
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
   * DELETE /api/training-sessions/:sessionId/exercises/:exerciseId
   * Remove an exercise from a session — ADMIN only.
   */
  fastify.delete(
    "/:sessionId/exercises/:exerciseId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { sessionId, exerciseId } = request.params as {
        sessionId: string;
        exerciseId: string;
      };
      const { clubId } = request.user as AccessTokenPayload;

      try {
        const session = await removeExerciseFromSession(
          fastify.prisma,
          clubId,
          sessionId,
          exerciseId,
        );
        return reply.status(200).send(session);
      } catch (err) {
        if (err instanceof TrainingSessionNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Sessão de treino não encontrada",
          });
        }
        if (err instanceof SessionExerciseNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Exercício não está nesta sessão",
          });
        }
        throw err;
      }
    },
  );
}
