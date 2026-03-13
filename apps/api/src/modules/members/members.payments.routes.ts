import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getMemberPaymentHistory,
  findMemberInClub,
} from "./members.payments.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

/**
 * Zod schema for query params — validated on every request.
 * `page` and `limit` are coerced from query-string strings to integers.
 */
const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /members/:id/payments
 *
 * Returns the paginated payment history for a single member, joined with
 * the underlying charge metadata.
 *
 * Access:       ADMIN + TREASURER (no requireRole guard needed — both roles
 *               are permitted per the RBAC matrix in security-guidelines.md §2).
 * Auth:         Provided by the protectedRoutes plugin-level verifyAccessToken
 *               preHandler hook — not repeated here.
 * Tenant scope: All queries run inside withTenantSchema via the service layer.
 *
 * Errors:
 *   400 — invalid query params (Zod parse failure)
 *   401 — missing or invalid access token (handled by protectedRoutes hook)
 *   404 — member not found in the authenticated club (IDOR-safe: returns 404
 *          not 403, so cross-tenant resource existence is never disclosed)
 *
 * Response envelope:
 *   { data: MemberPaymentItem[], meta: { total, page, limit } }
 *
 * `gatewayMeta` is intentionally excluded from the charge sub-object —
 * QR codes are time-limited and this endpoint is read-only audit data,
 * not a re-issuance surface.
 */
export async function memberPaymentRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get("/:id/payments", async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    const { clubId } = user;
    const { id: memberId } = request.params as { id: string };

    const queryResult = QuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: queryResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    }

    const { page, limit } = queryResult.data;

    const member = await findMemberInClub(fastify.prisma, clubId, memberId);
    if (!member) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Sócio não encontrado.",
      });
    }

    const result = await getMemberPaymentHistory(
      fastify.prisma,
      clubId,
      memberId,
      page,
      limit,
    );

    return reply.status(200).send(result);
  });
}
