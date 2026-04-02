import type { FastifyInstance } from "fastify";
import {
  CreateEvaluationSchema,
  UpdateEvaluationSchema,
  ListEvaluationsQuerySchema,
} from "./evaluations.schema.js";
import {
  createEvaluation,
  getEvaluationById,
  updateEvaluation,
  deleteEvaluation,
  listEvaluations,
  EvaluationNotFoundError,
  DuplicateEvaluationError,
} from "./evaluations.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function evaluationRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/evaluations
   * List evaluations with optional filtering.
   * Accessible by both ADMIN and TREASURER.
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListEvaluationsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;
    const result = await listEvaluations(fastify.prisma, clubId, parsed.data);
    return reply.status(200).send(result);
  });

  /**
   * POST /api/evaluations
   * Create a new evaluation.
   * Restricted to ADMIN role — coaches are always admins in this domain.
   */
  fastify.post(
    "/",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateEvaluationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const evaluation = await createEvaluation(
          fastify.prisma,
          clubId,
          request.actorId,
          parsed.data,
        );
        return reply.status(201).send(evaluation);
      } catch (err) {
        if (err instanceof DuplicateEvaluationError) {
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

  /**
   * GET /api/evaluations/:evaluationId
   * Retrieve a single evaluation by ID.
   * Accessible by both ADMIN and TREASURER.
   */
  fastify.get("/:evaluationId", async (request, reply) => {
    const { evaluationId } = request.params as { evaluationId: string };
    const { clubId } = request.user as AccessTokenPayload;

    try {
      const evaluation = await getEvaluationById(
        fastify.prisma,
        clubId,
        evaluationId,
      );
      return reply.status(200).send(evaluation);
    } catch (err) {
      if (err instanceof EvaluationNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: err.message,
        });
      }
      throw err;
    }
  });

  /**
   * PUT /api/evaluations/:evaluationId
   * Partially update an evaluation's scores or notes.
   * Restricted to ADMIN role.
   */
  fastify.put(
    "/:evaluationId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { evaluationId } = request.params as { evaluationId: string };

      const parsed = UpdateEvaluationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const evaluation = await updateEvaluation(
          fastify.prisma,
          clubId,
          request.actorId,
          evaluationId,
          parsed.data,
        );
        return reply.status(200).send(evaluation);
      } catch (err) {
        if (err instanceof EvaluationNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  /**
   * DELETE /api/evaluations/:evaluationId
   * Remove an evaluation permanently.
   * Restricted to ADMIN role.
   */
  fastify.delete(
    "/:evaluationId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { evaluationId } = request.params as { evaluationId: string };
      const { clubId } = request.user as AccessTokenPayload;

      try {
        await deleteEvaluation(
          fastify.prisma,
          clubId,
          request.actorId,
          evaluationId,
        );
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof EvaluationNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
