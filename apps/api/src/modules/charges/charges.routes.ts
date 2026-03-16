import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ChargeStatus } from "../../../generated/prisma/index.js";
import { GenerateMonthlyChargesSchema } from "./charges.schema.js";
import {
  generateMonthlyCharges,
  NoActivePlanError,
} from "./charges.service.js";
import { listCharges } from "./charges.list.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

const ListChargesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** YYYY-MM format — filters by calendar month of dueDate */
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
   *
   * Returns a paginated list of charges for the authenticated club.
   * Supports filtering by billing month (YYYY-MM), status, and memberId.
   *
   * Available to: ADMIN, TREASURER.
   *
   * Query params:
   *   page     — 1-based page number (default: 1)
   *   limit    — items per page, max 100 (default: 20)
   *   month    — YYYY-MM filter on dueDate calendar month
   *   status   — one of PENDING | PAID | OVERDUE | CANCELLED | PENDING_RETRY
   *   memberId — restrict to a single member
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
   * POST /api/charges/generate
   *
   * Manually triggers monthly charge generation for the authenticated club.
   * Equivalent to the BullMQ cron job but HTTP-triggered, so a
   * TREASURER can kick it off outside the scheduled window.
   *
   * Available to: ADMIN, TREASURER (both roles are valid — no requireRole guard
   * needed beyond the verifyAccessToken already applied by protectedRoutes).
   *
   * Body (all fields optional):
   *   billingPeriod — ISO datetime; only year/month are used. Defaults to the
   *                   current UTC month.
   *   dueDate       — ISO datetime override for the charge due date. Defaults to
   *                   the last day of the billing month.
   *
   * Returns the full ChargeGenerationResult so the caller can immediately display
   * QR codes and summaries without a second round-trip.
   *
   * Partial failure (some members errored, some gateway calls failed) still
   * returns 200 — callers should inspect `errors[]` and `gatewayErrors[]`.
   *
   * Idempotent: calling this endpoint twice in the same month produces
   * `generated: 0, skipped: N` on the second call (handled by the service layer).
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
