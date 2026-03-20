import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ChargeStatus } from "../../../generated/prisma/index.js";
import { GenerateMonthlyChargesSchema } from "./charges.schema.js";
import {
  generateMonthlyCharges,
  NoActivePlanError,
} from "./charges.service.js";
import { listCharges } from "./charges.list.service.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { assertChargeExists } from "../../lib/assert-tenant-ownership.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

const ListChargesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
    .optional(),
  status: z
    .enum(["PENDING", "PAID", "OVERDUE", "CANCELLED", "PENDING_RETRY"])
    .optional(),
  memberId: z.string().optional(),
});

export async function chargeRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/charges
   * List charges — no single-resource ID, no IDOR risk.
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListChargesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;

    const result = await listCharges(fastify.prisma, clubId, {
      ...parsed.data,
      status: parsed.data.status as ChargeStatus | undefined,
    });
    return reply.status(200).send(result);
  });

  /**
   * GET /api/charges/:chargeId
   */
  fastify.get("/:chargeId", async (request, reply) => {
    const { chargeId } = request.params as { chargeId: string };
    const { clubId } = request.user as AccessTokenPayload;

    const charge = await withTenantSchema(
      fastify.prisma,
      clubId,
      async (tx) => {
        await assertChargeExists(tx, chargeId);
        return tx.charge.findUnique({ where: { id: chargeId } });
      },
    );

    if (!charge) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Cobrança não encontrada.",
      });
    }

    return reply.status(200).send(charge);
  });

  /**
   * POST /api/charges/:chargeId/cancel
   */
  fastify.post(
    "/:chargeId/cancel",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { chargeId } = request.params as { chargeId: string };
      const { clubId } = request.user as AccessTokenPayload;

      const result = await withTenantSchema(
        fastify.prisma,
        clubId,
        async (tx) => {
          await assertChargeExists(tx, chargeId);
          return tx.charge.update({
            where: { id: chargeId },
            data: { status: "CANCELLED" },
          });
        },
      );

      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/charges/generate
   */
  fastify.post("/generate", async (request, reply) => {
    const parseResult = GenerateMonthlyChargesSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;
    const actorId = request.actorId;

    try {
      const result = await generateMonthlyCharges(
        fastify.prisma,
        clubId,
        actorId,
        parseResult.data,
      );

      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof NoActivePlanError) {
        return reply.status(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: err.message,
        });
      }

      throw err;
    }
  });
}
