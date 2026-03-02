import type { FastifyInstance } from "fastify";
import {
  UpsertTemplateSchema,
  TemplateKeyParamSchema,
} from "./templates.schema.js";
import {
  listTemplates,
  upsertTemplate,
  resetTemplate,
} from "./templates.service.js";
import type { TemplateKey } from "./templates.constants.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function templateRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/templates
   *
   * Returns the current effective template body for every key (3 entries),
   * indicating whether each is a club-custom override or the system default.
   *
   * Available to ADMIN and TREASURER (read-only — no requireRole guard beyond
   * the verifyAccessToken already applied by protectedRoutes).
   */
  fastify.get("/", async (request, reply) => {
    const { clubId } = request.user as AccessTokenPayload;

    const templates = await listTemplates(fastify.prisma, clubId);
    return reply.status(200).send(templates);
  });

  /**
   * PUT /api/templates/:key
   *
   * Creates or updates a custom template for the authenticated club.
   * Restricted to ADMIN — treasurers may not alter billing message content.
   *
   * Body: { body: string (10–1000 chars), channel?: "WHATSAPP" | "EMAIL" }
   */
  fastify.put(
    "/:key",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const keyParse = TemplateKeyParamSchema.safeParse(request.params);
      if (!keyParse.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Chave de template inválida. Valores aceitos: charge_reminder_d3, charge_reminder_d0, overdue_notice.`,
        });
      }

      const bodyParse = UpsertTemplateSchema.safeParse(request.body);
      if (!bodyParse.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: bodyParse.error.issues[0]?.message ?? "Payload inválido.",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;
      const actorId = request.actorId;

      await upsertTemplate(
        fastify.prisma,
        clubId,
        actorId,
        keyParse.data.key as TemplateKey,
        bodyParse.data.body,
        bodyParse.data.channel,
      );

      return reply.status(200).send({ success: true });
    },
  );

  /**
   * DELETE /api/templates/:key
   *
   * Removes the club's custom template override, reverting to the system default.
   * Idempotent — safe to call when no custom row exists.
   * Restricted to ADMIN.
   *
   * Query param: channel (default "WHATSAPP")
   */
  fastify.delete(
    "/:key",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const keyParse = TemplateKeyParamSchema.safeParse(request.params);
      if (!keyParse.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: `Chave de template inválida. Valores aceitos: charge_reminder_d3, charge_reminder_d0, overdue_notice.`,
        });
      }

      const query = request.query as { channel?: string };
      const channel: "WHATSAPP" | "EMAIL" =
        query.channel === "EMAIL" ? "EMAIL" : "WHATSAPP";

      const { clubId } = request.user as AccessTokenPayload;
      const actorId = request.actorId;

      await resetTemplate(
        fastify.prisma,
        clubId,
        actorId,
        keyParse.data.key as TemplateKey,
        channel,
      );

      return reply.status(200).send({ success: true });
    },
  );
}
