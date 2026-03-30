import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyCardToken } from "./members.card.service.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { getEnv } from "../../lib/env.js";

const QuerySchema = z.object({
  token: z.string().min(1),
});

/**
 * Public member card verification routes.
 *
 * These routes are registered OUTSIDE `protectedRoutes` (no JWT required).
 * They are mounted under `/api/public` in server.ts.
 *
 * Rate limiting is inherited from the global `@fastify/rate-limit` plugin
 * (100 req/min per IP). If abuse becomes a concern, tighten the limit
 * specifically for `/api/public/verify-member-card` via route-level config.
 */
export async function memberVerifyRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/public/verify-member-card?token=<cardToken>
   *
   * Verifies a digital membership card token and returns real-time member
   * status. No authentication required — this endpoint is called by anyone
   * who scans a card's QR code (e.g., gate staff, event organizers).
   *
   * Security design:
   *   - Always returns HTTP 200 regardless of token validity to prevent
   *     information leakage via HTTP status codes.
   *   - `valid: false` with a human-readable `reason` for any failure case.
   *   - Token is verified cryptographically (HS256 HMAC) before any DB query.
   *   - Real-time member.status is re-fetched from the DB after token
   *     verification so a revoked/suspended member is caught immediately,
   *     even within the 24-hour token window.
   *
   * Response shape:
   *   { valid: true, memberName, memberStatus, clubName, clubLogoUrl, verifiedAt }
   *   { valid: false, reason: string }
   */
  fastify.get("/verify-member-card", async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        valid: false,
        reason: "Token ausente ou inválido.",
      });
    }

    const { MEMBER_CARD_SECRET } = getEnv();

    let payload;
    try {
      payload = verifyCardToken(parsed.data.token, MEMBER_CARD_SECRET);
    } catch {
      return reply.status(200).send({
        valid: false,
        reason: "Carteirinha expirada ou inválida.",
      });
    }

    try {
      const member = await withTenantSchema(
        fastify.prisma,
        payload.clubId,
        async (tx) =>
          tx.member.findUnique({
            where: { id: payload.sub },
            select: { status: true, name: true },
          }),
      );

      if (!member) {
        return reply.status(200).send({
          valid: false,
          reason: "Sócio não encontrado.",
        });
      }

      const club = await fastify.prisma.club.findUnique({
        where: { id: payload.clubId },
        select: { name: true, logoUrl: true },
      });

      return reply.status(200).send({
        valid: true,
        memberName: member.name,
        memberStatus: member.status,
        clubName: club?.name ?? payload.clubName,
        clubLogoUrl: club?.logoUrl ?? null,
        verifiedAt: new Date().toISOString(),
      });
    } catch {
      return reply.status(200).send({
        valid: false,
        reason: "Não foi possível verificar a carteirinha. Tente novamente.",
      });
    }
  });
}
