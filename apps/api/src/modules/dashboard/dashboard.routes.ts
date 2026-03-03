import type { FastifyInstance } from "fastify";
import { getDashboardSummary } from "./dashboard.service.js";
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
}
