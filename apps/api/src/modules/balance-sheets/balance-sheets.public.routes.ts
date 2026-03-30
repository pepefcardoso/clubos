import type { FastifyInstance } from "fastify";
import { listBalanceSheetsByClubSlug } from "./balance-sheets.service.js";

export async function balanceSheetPublicRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/public/clubs/:slug/balance-sheets
   *
   * Returns all published balance sheets for the club identified by `slug`,
   * ordered by publication date (newest first).
   *
   * No authentication required — this is a public compliance endpoint mandated
   * by Lei 14.193/2021 (Lei das SAF).
   *
   * When `slug` does not match any club, responds with 200 and an empty list
   * rather than 404 — the transparency page should show an empty state without
   * surfacing whether a club exists at all.
   *
   * Response: { data: BalanceSheetResponse[], total: number }
   */
  fastify.get("/clubs/:slug/balance-sheets", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const result = await listBalanceSheetsByClubSlug(fastify.prisma, slug);
    return reply.status(200).send(result);
  });
}
