import type { FastifyInstance } from "fastify";
import { ListMessagesQuerySchema } from "./messages.schema.js";
import { listMessages } from "./messages.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function messageRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/messages
   *
   * Paginated audit log of all WhatsApp/email messages sent by the club.
   * Available to ADMIN and TREASURER (read-only — verifyAccessToken is
   * applied by protectedRoutes; no additional requireRole guard needed).
   *
   * Query params (all optional):
   *   memberId, channel, status, template, dateFrom, dateTo, page, limit
   */
  fastify.get("/", async (request, reply) => {
    const parseResult = ListMessagesQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          parseResult.error.issues[0]?.message ?? "Invalid query params.",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;
    const result = await listMessages(fastify.prisma, clubId, parseResult.data);
    return reply.status(200).send(result);
  });

  /**
   * GET /api/messages/member/:memberId
   *
   * Convenience endpoint returning the message history for a single member.
   * Delegates to listMessages() with memberId pre-filled from the path param.
   * Used by the member detail page to show the communication audit trail.
   */
  fastify.get("/member/:memberId", async (request, reply) => {
    const { memberId } = request.params as { memberId: string };

    const parseResult = ListMessagesQuerySchema.safeParse({
      ...(request.query as Record<string, unknown>),
      memberId,
    });

    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          parseResult.error.issues[0]?.message ?? "Invalid query params.",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;
    const result = await listMessages(fastify.prisma, clubId, parseResult.data);
    return reply.status(200).send(result);
  });
}
