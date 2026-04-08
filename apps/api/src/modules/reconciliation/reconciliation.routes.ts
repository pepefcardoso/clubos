import type { FastifyInstance } from "fastify";
import type { AccessTokenPayload } from "../../types/fastify.js";
import {
  OfxParseError,
  MatchRequestSchema,
  ConfirmMatchSchema,
  type OfxTransaction,
} from "./reconciliation.schema.js";
import { parseOfxFile } from "./reconciliation.parser.js";
import {
  matchOfxTransactions,
  confirmReconciliationMatch,
} from "./reconciliation.service.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";

const MAX_OFX_FILE_SIZE = 2 * 1024 * 1024;

export async function reconciliationRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * POST /api/reconciliation/parse-ofx
   *
   * Accepts a multipart OFX file upload (.ofx extension required) and returns
   * the parsed bank statement as structured JSON.
   *
   * No data is persisted — the response feeds the matching UI directly.
   *
   * Access:  ADMIN only.
   * Errors:  400 (no file / bad extension / exceeds 2 MB), 422 (parse failure)
   */
  fastify.post(
    "/parse-ofx",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      let data;
      try {
        data = await request.file();
      } catch (err) {
        const error = err as { statusCode?: number };
        if (error.statusCode === 413) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Arquivo excede o limite de 2 MB",
          });
        }
        throw err;
      }

      if (!data) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Arquivo OFX não enviado",
        });
      }

      const filename = data.filename?.toLowerCase() ?? "";
      if (!filename.endsWith(".ofx")) {
        await data.toBuffer().catch(() => {});
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Apenas arquivos com extensão .ofx são aceitos",
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
            message: "Arquivo excede o limite de 2 MB",
          });
        }
        throw err;
      }

      if (buffer.length > MAX_OFX_FILE_SIZE) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Arquivo excede o limite de 2 MB",
        });
      }

      let result;
      try {
        result = parseOfxFile(buffer);
      } catch (err) {
        if (err instanceof OfxParseError) {
          return reply.status(422).send({
            statusCode: 422,
            error: "Unprocessable Entity",
            message: err.message,
          });
        }
        throw err;
      }

      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/reconciliation/match
   *
   * Accepts the transactions array from a parse-ofx response and returns
   * automatic correspondence results against the club's open charges.
   *
   * Pure read — no data is persisted.
   *
   * Access:  ADMIN only.
   * Errors:  400 (validation), 403 (role)
   * Response: MatchResponse
   */
  fastify.post(
    "/match",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = MatchRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            parsed.error.issues[0]?.message ?? "Dados de entrada inválidos",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      const transactions = parsed.data
        .transactions as unknown as OfxTransaction[];

      const result = await matchOfxTransactions(
        fastify.prisma,
        clubId,
        transactions,
      );

      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/reconciliation/confirm
   *
   * Confirms an OFX ↔ Charge correspondence by creating a Payment and marking
   * the Charge as PAID. Updates Member status to ACTIVE if they were OVERDUE.
   *
   * Idempotent via fitId (gatewayTxid unique index).
   *
   * Access:  ADMIN only.
   * Errors:  400 (validation), 403 (role), 404 (charge not found), 409 (conflict)
   * Response: ConfirmMatchResponse
   */
  fastify.post(
    "/confirm",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = ConfirmMatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            parsed.error.issues[0]?.message ?? "Dados de entrada inválidos",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const result = await confirmReconciliationMatch(
          fastify.prisma,
          clubId,
          request.actorId,
          parsed.data,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (err instanceof ConflictError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
