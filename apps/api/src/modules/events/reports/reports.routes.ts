import type { FastifyInstance } from "fastify";
import { getEventReport, generateEventReportPdf } from "./reports.service.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";

export async function eventReportRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/events/:eventId/report
   *
   * Generates and streams the bilheteria PDF for a completed event.
   * Writes EVENT_REPORT_GENERATED to audit_log.
   *
   * Access: ADMIN | TREASURER (OR-allowlist — PHYSIO blocked)
   *
   * Response headers:
   *   Content-Type              application/pdf
   *   Content-Disposition       attachment; filename="relatorio-bilheteria-{eventId}.pdf"
   *   X-Report-Hash             SHA-256 integrity hash (first 64 hex chars)
   */
  fastify.get(
    "/:eventId/report",
    { preHandler: [fastify.requireRole("ADMIN", "TREASURER")] },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const { clubId } = request.user as AccessTokenPayload;

      const data = await getEventReport(
        fastify.prisma,
        clubId,
        eventId,
        request.actorId,
      );

      const club = await fastify.prisma.club.findUnique({
        where: { id: clubId },
        select: { name: true },
      });

      const pdf = await generateEventReportPdf(data, club?.name ?? "Clube");
      const filename = `relatorio-bilheteria-${eventId}.pdf`;

      return reply
        .status(200)
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .header("X-Report-Hash", data.integrityHash)
        .send(pdf);
    },
  );
}
