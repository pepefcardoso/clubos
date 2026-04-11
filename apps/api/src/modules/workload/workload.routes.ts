import type { FastifyInstance } from "fastify";
import {
  CreateWorkloadMetricSchema,
  AcwrQuerySchema,
  AttendanceRankingQuerySchema,
  InjuryCorrelationQuerySchema,
  AtRiskAthletesQuerySchema,
} from "./workload.schema.js";
import {
  recordWorkloadMetric,
  getAthleteAcwr,
  getAttendanceRanking,
  getInjuryCorrelation,
  getAtRiskAthletes,
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

  /**
   * GET /api/workload/attendance-ranking?days=30&sessionType=TRAINING
   *
   * Returns a ranked list of all active athletes sorted by session count
   * within the look-back window, enriched with their latest ACWR risk zone.
   *
   * Accessible by both ADMIN and TREASURER roles.
   *
   * ACWR data may lag up to 4 hours behind the most recent workload metric
   * insertions — `acwrLastRefreshedAt` in the response indicates freshness.
   * A null `riskZone` on an athlete means the materialized view has not yet
   * been refreshed with their data (expected state on first deploy).
   */
  fastify.get("/attendance-ranking", async (request, reply) => {
    const user = request.user as AccessTokenPayload;

    const parsed = AttendanceRankingQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const result = await getAttendanceRanking(
      fastify.prisma,
      user.clubId,
      parsed.data,
    );
    return reply.status(200).send(result);
  });

  /**
   * GET /api/workload/injury-correlation?days=30&minAcwr=1.3
   *
   * Returns injury events that occurred when the athlete's ACWR was above the
   * configured threshold. Only plaintext fields from medical_records are
   * returned (structure, grade, mechanism, occurredAt) — no clinical field
   * decryption happens here.
   *
   * No data_access_log entry is written — structure/grade/mechanism are the
   * analytics-safe plaintext fields, not the AES-256 clinical fields subject
   * to LGPD Art. 37 logging requirements.
   *
   * Restricted to ADMIN | PHYSIO via requireRole OR-allowlist.
   * TREASURER is explicitly blocked — this endpoint correlates clinical injury
   * data (even if plaintext) with training load, which is clinical context.
   */
  fastify.get(
    "/injury-correlation",
    { preHandler: [fastify.requireRole("ADMIN", "PHYSIO")] },
    async (request, reply) => {
      const parsed = InjuryCorrelationQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid query params",
        });
      }

      const user = request.user as AccessTokenPayload;
      const result = await getInjuryCorrelation(
        fastify.prisma,
        user.clubId,
        parsed.data,
      );
      return reply.status(200).send(result);
    },
  );

  /**
   * GET /api/workload/at-risk-athletes?minAcwr=1.3
   *
   * Returns currently active athletes whose latest ACWR ratio is above the
   * configured threshold — proactive injury prevention view for physiotherapists.
   *
   * Results are ordered by ACWR descending (highest-risk athletes first).
   * Athletes with no ACWR data (before first MV refresh) are excluded.
   *
   * Restricted to ADMIN | PHYSIO — same rationale as /injury-correlation.
   */
  fastify.get(
    "/at-risk-athletes",
    { preHandler: [fastify.requireRole("ADMIN", "PHYSIO")] },
    async (request, reply) => {
      const parsed = AtRiskAthletesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid query params",
        });
      }

      const user = request.user as AccessTokenPayload;
      const result = await getAtRiskAthletes(
        fastify.prisma,
        user.clubId,
        parsed.data,
      );
      return reply.status(200).send(result);
    },
  );
}
