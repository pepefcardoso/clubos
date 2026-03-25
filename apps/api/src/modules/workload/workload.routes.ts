import type { FastifyInstance } from "fastify";
import {
  CreateWorkloadMetricSchema,
  AcwrQuerySchema,
} from "./workload.schema.js";
import {
  recordWorkloadMetric,
  getAthleteAcwr,
  AthleteNotFoundError,
} from "./workload.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function workloadRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/workload/metrics
   *
   * Records a single Foster Session-RPE workload entry for an athlete.
   * Accessible by both ADMIN and TREASURER roles (JWT enforced at plugin level
   * by protectedRoutes — no additional preHandler needed).
   *
   * The acwr_aggregates materialized view is NOT refreshed inline — the new
   * data becomes visible after BullMQ job runs (every 4 hours).
   * The response includes the computed `trainingLoadAu` for immediate feedback.
   */
  fastify.post("/metrics", async (request, reply) => {
    const parsed = CreateWorkloadMetricSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const user = request.user as AccessTokenPayload;

    try {
      const metric = await recordWorkloadMetric(
        fastify.prisma,
        user.clubId,
        request.actorId,
        parsed.data,
      );
      return reply.status(201).send(metric);
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
   * GET /api/workload/athletes/:athleteId/acwr?days=28
   *
   * Returns ACWR history for an athlete from the acwr_aggregates materialized
   * view. The `days` query parameter controls the lookback window (7–90).
   *
   * Data may lag up to 4 hours behind the most recent metric insertions — this
   * is expected and documented in the response.
   * An empty `{ history: [], latest: null }` response is returned (not 404) when
   * the view has not been refreshed yet or has no rows for the athlete.
   */
  fastify.get("/athletes/:athleteId/acwr", async (request, reply) => {
    const { athleteId } = request.params as { athleteId: string };
    const user = request.user as AccessTokenPayload;

    const parsed = AcwrQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    try {
      const result = await getAthleteAcwr(
        fastify.prisma,
        user.clubId,
        athleteId,
        parsed.data.days,
      );
      return reply.status(200).send(result);
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
}
