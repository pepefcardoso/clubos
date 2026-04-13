import type { FastifyInstance } from "fastify";
import { RevenueStatementQuerySchema } from "./revenue-statement.schema.js";
import { getRevenueStatement } from "./revenue-statement.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function revenueStatementRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/revenue-statement
   *
   * Returns the integrated revenue statement for the authenticated club,
   * aggregated by calendar month over the selected period.
   *
   * Authorization: TREASURER or ADMIN (financial data hierarchy).
   * PHYSIO (level 0) is automatically blocked by the TREASURER guard —
   * no additional guard is required.
   *
   * Query param modes (mutually exclusive — use exactly one):
   *   ?months=12                         — trailing N months (default: 12)
   *   ?year=2025                         — full calendar year
   *   ?from=YYYY-MM-DD&to=YYYY-MM-DD     — explicit custom range
   *
   * Response shape: RevenueStatementResponse
   *   - periods[] — one row per calendar month, ordered newest-first
   *   - totals    — aggregate across all periods in range
   */
  fastify.get(
    "/",
    { preHandler: [fastify.requireRole("TREASURER")] },
    async (request, reply) => {
      const parsed = RevenueStatementQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            parsed.error.issues[0]?.message ?? "Parâmetros de query inválidos.",
        });
      }

      const { months, year, from, to } = parsed.data;

      const activeModesCount = [
        months !== undefined,
        year !== undefined,
        from !== undefined || to !== undefined,
      ].filter(Boolean).length;

      if (activeModesCount > 1) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Use apenas um modo de período: months, year, ou from+to.",
        });
      }

      if ((from === undefined) !== (to === undefined)) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Os parâmetros from e to devem ser informados juntos.",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      const result = await getRevenueStatement(
        fastify.prisma,
        clubId,
        parsed.data,
      );

      return reply.status(200).send(result);
    },
  );
}
