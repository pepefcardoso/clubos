import type { FastifyInstance } from "fastify";
import {
  CreateMemberSchema,
  UpdateMemberSchema,
  ListMembersQuerySchema,
} from "./members.schema.js";
import {
  createMember,
  listMembers,
  getMemberById,
  updateMember,
  DuplicateCpfError,
  PlanNotFoundError,
  MemberNotFoundError,
} from "./members.service.js";
import { importMembersFromCsv } from "./members-import.service.js";
import { getRedisClient } from "../../lib/redis.js";
import { checkAndConsumeWhatsAppRateLimit } from "../../lib/whatsapp-rate-limit.js";
import { hasRecentMessage } from "../messages/messages.service.js";
import { sendWhatsAppMessage } from "../whatsapp/whatsapp.service.js";
import { buildRenderedMessage } from "../templates/templates.service.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { assertMemberExists } from "../../lib/assert-tenant-ownership.js";
import { TEMPLATE_KEYS } from "../templates/templates.constants.js";
import type { AccessTokenPayload } from "../../types/fastify.js";
import { memberPaymentRoutes } from "./members.payments.routes.js";

/**
 * Cooldown window (hours) for the manual remind endpoint.
 */
const MANUAL_REMIND_COOLDOWN_H = 4;

export async function memberRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/members
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListMembersQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const user = request.user as AccessTokenPayload;
    const result = await listMembers(fastify.prisma, user.clubId, parsed.data);
    return reply.status(200).send(result);
  });

  /**
   * POST /api/members
   */
  fastify.post("/", async (request, reply) => {
    const parsed = CreateMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const user = request.user as AccessTokenPayload;

    try {
      const member = await createMember(
        fastify.prisma,
        user.clubId,
        request.actorId,
        parsed.data,
      );
      return reply.status(201).send(member);
    } catch (err) {
      if (err instanceof DuplicateCpfError) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Sócio com este CPF já está cadastrado",
        });
      }
      if (err instanceof PlanNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Plano não encontrado ou inativo",
        });
      }
      throw err;
    }
  });

  /**
   * GET /api/members/:memberId
   * L-04: assertMemberExists inside withTenantSchema scopes the check to the
   * authenticated club's schema — cross-tenant IDs return 404.
   */
  fastify.get("/:memberId", async (request, reply) => {
    const { memberId } = request.params as { memberId: string };
    const user = request.user as AccessTokenPayload;

    try {
      const member = await withTenantSchema(
        fastify.prisma,
        user.clubId,
        async (tx) => {
          await assertMemberExists(tx, memberId);
          return getMemberById(tx, user.clubId, memberId);
        },
      );
      return reply.status(200).send(member);
    } catch (err) {
      if (err instanceof MemberNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Sócio não encontrado",
        });
      }
      throw err;
    }
  });

  /**
   * PUT /api/members/:memberId
   * L-04: existence check runs before any mutation.
   */
  fastify.put(
    "/:memberId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { memberId } = request.params as { memberId: string };

      const parsed = UpdateMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const user = request.user as AccessTokenPayload;

      try {
        const member = await withTenantSchema(
          fastify.prisma,
          user.clubId,
          async (tx) => {
            await assertMemberExists(tx, memberId);
            return updateMember(
              tx,
              user.clubId,
              request.actorId,
              memberId,
              parsed.data,
            );
          },
        );
        return reply.status(200).send(member);
      } catch (err) {
        if (err instanceof MemberNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Sócio não encontrado",
          });
        }
        throw err;
      }
    },
  );

  /**
   * POST /api/members/:memberId/remind
   * L-04: The existing withTenantSchema + member.findUnique inside the handler
   * already provides schema-scoped ownership. assertMemberExists is called
   * first as an explicit defense-in-depth guard.
   */
  fastify.post("/:memberId/remind", async (request, reply) => {
    const { clubId } = request.user as AccessTokenPayload;
    const actorId = request.actorId;
    const { memberId } = request.params as { memberId: string };

    const alreadySent = await hasRecentMessage(
      fastify.prisma,
      clubId,
      memberId,
      TEMPLATE_KEYS.CHARGE_REMINDER_MANUAL,
      MANUAL_REMIND_COOLDOWN_H,
    );
    if (alreadySent) {
      return reply.status(429).send({
        statusCode: 429,
        error: "Too Many Requests",
        message: `Uma mensagem já foi enviada para este sócio nas últimas ${MANUAL_REMIND_COOLDOWN_H} horas.`,
      });
    }

    const redis = getRedisClient();
    const rl = await checkAndConsumeWhatsAppRateLimit(redis, clubId);
    if (!rl.allowed) {
      return reply.status(429).send({
        statusCode: 429,
        error: "Too Many Requests",
        message: `Limite de mensagens atingido. Tente novamente em ${Math.ceil(rl.retryAfterMs / 1000)}s.`,
      });
    }

    const row = await withTenantSchema(fastify.prisma, clubId, async (tx) => {
      await assertMemberExists(tx, memberId);

      const charge = await tx.charge.findFirst({
        where: { memberId, status: "OVERDUE" },
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          amountCents: true,
          dueDate: true,
          gatewayMeta: true,
        },
      });
      if (!charge) return null;

      const member = await tx.member.findUnique({
        where: { id: memberId },
        select: { id: true, name: true, phone: true },
      });
      if (!member) return null;

      return { member, charge };
    });

    if (!row) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Sócio não encontrado ou sem cobranças em atraso.",
      });
    }

    const renderedBody = await buildRenderedMessage(
      fastify.prisma,
      clubId,
      TEMPLATE_KEYS.CHARGE_REMINDER_MANUAL,
      {
        amountCents: row.charge.amountCents,
        dueDate: row.charge.dueDate,
        gatewayMeta: row.charge.gatewayMeta as
          | Record<string, unknown>
          | null
          | undefined,
      },
      row.member.name,
    );

    const result = await sendWhatsAppMessage(
      fastify.prisma,
      {
        clubId,
        memberId,
        encryptedPhone: Buffer.from(row.member.phone),
        template: TEMPLATE_KEYS.CHARGE_REMINDER_MANUAL,
        renderedBody,
      },
      actorId,
    );

    const statusCode = result.status === "SENT" ? 200 : 502;
    return reply.status(statusCode).send(result);
  });

  /**
   * POST /api/members/import
   */
  fastify.post("/import", async (request, reply) => {
    let data;
    try {
      data = await request.file();
    } catch (err) {
      const error = err as { statusCode?: number };
      if (error.statusCode === 413) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Arquivo excede o limite de 5 MB",
        });
      }
      throw err;
    }

    if (!data) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Arquivo CSV não enviado",
      });
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err) {
      const error = err as { statusCode?: number };
      if (error.statusCode === 413) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Arquivo excede o limite de 5 MB",
        });
      }
      throw err;
    }

    if (buffer.length > 5 * 1024 * 1024) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Arquivo excede o limite de 5 MB",
      });
    }

    const csvString = buffer.toString("utf-8");
    const user = request.user as AccessTokenPayload;

    const result = await importMembersFromCsv(
      fastify.prisma,
      user.clubId,
      request.actorId,
      csvString,
    );

    if ("error" in result) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: result.error,
      });
    }

    return reply.status(200).send(result);
  });

  await fastify.register(memberPaymentRoutes);
}
