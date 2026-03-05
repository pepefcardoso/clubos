import type { FastifyInstance } from "fastify";
import { getDashboardSummary, getChargesHistory } from "./dashboard.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/dashboard/summary
   *
   * Returns aggregated KPI counters for the authenticated club's tenant schema:
   *   - member counts by status (total / active / inactive / overdue)
   *   - charge aggregates for PENDING and OVERDUE buckets
   *   - payments confirmed in the current calendar month (cancelled excluded)
   *
   * No role guard — accessible by both ADMIN and TREASURER.
   * Authentication is enforced by the protectedRoutes plugin-level hook.
   */
  fastify.get("/summary", async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    const summary = await getDashboardSummary(fastify.prisma, user.clubId);
    return reply.status(200).send(summary);
  });

  /**
   * GET /api/dashboard/charges-history
   *
   * Returns per-month charge counts and amounts for the last N calendar months.
   * Optional query param: ?months=N (clamped to [1, 12], default 6).
   *
   * Always returns exactly `months` items ordered oldest-first.
   * Months with no charges are included with all numeric fields set to 0.
   *
   * No role guard — accessible by ADMIN and TREASURER.
   */
  fastify.get("/charges-history", async (request, reply) => {
    const query = request.query as { months?: string };
    const raw = Number(query.months);
    const months = Math.min(12, Math.max(1, Number.isNaN(raw) ? 6 : raw));

    const user = request.user as AccessTokenPayload;
    const data = await getChargesHistory(fastify.prisma, user.clubId, months);
    return reply.status(200).send(data);
  });
}
