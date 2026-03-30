import type { FastifyInstance } from "fastify";
import type { AccessTokenPayload } from "../../types/fastify.js";
import { assertMemberExists } from "../../lib/assert-tenant-ownership.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { generateMemberCard } from "./members.card.service.js";
import { getEnv } from "../../lib/env.js";

/**
 * Member digital card routes — registered inside `memberRoutes` (protected).
 *
 * All routes here require a valid access token (ADMIN or TREASURER).
 * The `verifyAccessToken` preHandler is already applied at the
 * `protectedRoutes` plugin level — it does not need to be repeated here.
 */
export async function memberCardRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/members/:memberId/card
   *
   * Generates a signed 24-hour digital membership card token for the given
   * member. The token is a compact HS256 JWT containing non-sensitive display
   * data (member name, status, club info) — suitable for embedding in a QR
   * code and scanning by anyone without an account.
   *
   * Security:
   *   - Signed with MEMBER_CARD_SECRET (separate from JWT_SECRET).
   *   - `type: "member_card"` claim prevents use as an access token.
   *   - IDOR guard via assertMemberExists — returns 404 for resources outside
   *     the authenticated club's schema.
   *   - Never includes CPF, phone, or any encrypted field values.
   *
   * Access:   ADMIN + TREASURER (both may generate cards for members).
   * Errors:   401 (no token), 404 (member not in club).
   * Response: MemberCardData — see members.card.service.ts
   */
  fastify.get("/:memberId/card", async (request, reply) => {
    const { memberId } = request.params as { memberId: string };
    const { clubId } = request.user as AccessTokenPayload;
    const { MEMBER_CARD_SECRET } = getEnv();

    await withTenantSchema(fastify.prisma, clubId, async (tx) => {
      await assertMemberExists(tx, memberId);
    });

    const cardData = await generateMemberCard(
      fastify.prisma,
      clubId,
      memberId,
      MEMBER_CARD_SECRET,
    );

    return reply.status(200).send(cardData);
  });
}
