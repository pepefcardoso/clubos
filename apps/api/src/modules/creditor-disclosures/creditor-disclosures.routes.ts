import type { FastifyInstance } from "fastify";
import {
  CreateCreditorDisclosureSchema,
  UpdateCreditorStatusSchema,
  ListCreditorDisclosuresQuerySchema,
} from "./creditor-disclosures.schema.js";
import {
  createCreditorDisclosure,
  listCreditorDisclosures,
  updateCreditorDisclosureStatus,
  exportCreditorDisclosuresPdf,
} from "./creditor-disclosures.service.js";
import { NotFoundError, ForbiddenError } from "../../lib/errors.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function creditorDisclosureRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/creditor-disclosures
   *
   * Returns a paginated list of creditor disclosures with optional status and
   * date-range filters. Also returns `pendingTotalCents` for the SAF dashboard.
   *
   * Available to ADMIN and TREASURER (read access).
   *
   * Query params:
   *   page         (default 1)
   *   limit        (default 20, max 100)
   *   status       PENDING | SETTLED | DISPUTED
   *   dueDateFrom  YYYY-MM-DD
   *   dueDateTo    YYYY-MM-DD
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListCreditorDisclosuresQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Parâmetros inválidos.",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;
    const result = await listCreditorDisclosures(
      fastify.prisma,
      clubId,
      parsed.data,
    );
    return reply.status(200).send(result);
  });

  /**
   * POST /api/creditor-disclosures
   *
   * Registers a new creditor disclosure (passivo trabalhista).
   * ADMIN role required.
   *
   * APPEND-ONLY: no delete endpoint exists for this resource.
   * `registeredBy` is always set from the authenticated actorId (JWT) — never
   * from the request body.
   *
   * Body:
   *   creditorName  string  (2–200 chars, required)
   *   description   string  (max 500 chars, optional)
   *   amountCents   number  (positive integer, required)
   *   dueDate       string  (YYYY-MM-DD, required)
   */
  fastify.post(
    "/",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateCreditorDisclosureSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;
      const disclosure = await createCreditorDisclosure(
        fastify.prisma,
        clubId,
        request.actorId,
        parsed.data,
      );
      return reply.status(201).send(disclosure);
    },
  );

  /**
   * PATCH /api/creditor-disclosures/:disclosureId/status
   *
   * Transitions a disclosure's status (PENDING → SETTLED | DISPUTED).
   * ADMIN role required.
   *
   * Constraints (Lei 14.193/2021):
   * - Only PENDING → SETTLED or DISPUTED is allowed.
   * - Cannot revert to PENDING.
   * - Cannot change any other field.
   *
   * Errors:
   *   400 — invalid status value
   *   403 — disclosure is already SETTLED or DISPUTED
   *   404 — disclosure not found in the tenant schema
   */
  fastify.patch(
    "/:disclosureId/status",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { disclosureId } = request.params as { disclosureId: string };

      const parsed = UpdateCreditorStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Status inválido.",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const updated = await updateCreditorDisclosureStatus(
          fastify.prisma,
          clubId,
          request.actorId,
          disclosureId,
          parsed.data,
        );
        return reply.status(200).send(updated);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (err instanceof ForbiddenError) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  /**
   * GET /api/creditor-disclosures/export/pdf
   *
   * Generates a PDF report of ALL creditor disclosures (no pagination).
   * ADMIN role required.
   *
   * The SHA-256 hash of the generated PDF is:
   *   1. Recorded in audit_log before the response is sent (tamper-evidence).
   *   2. Returned in the `X-Export-Hash` response header for client verification.
   *
   * NOTE: This route must be registered BEFORE /:disclosureId/status to prevent
   * Fastify from routing "export" as a disclosureId param.
   *
   * Response headers:
   *   Content-Type            application/pdf
   *   Content-Disposition     attachment; filename="passivos-trabalhistas-YYYY-MM-DD.pdf"
   *   X-Export-Hash           SHA-256 hex digest of the PDF bytes
   *   X-Export-Record-Count   Number of records included in the export
   */
  fastify.get(
    "/export/pdf",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { clubId } = request.user as AccessTokenPayload;

      const { buffer, hash, recordCount } = await exportCreditorDisclosuresPdf(
        fastify.prisma,
        clubId,
        request.actorId,
      );

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `passivos-trabalhistas-${dateStr}.pdf`;

      return reply
        .status(200)
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .header("X-Export-Hash", hash)
        .header("X-Export-Record-Count", String(recordCount))
        .send(buffer);
    },
  );
}
