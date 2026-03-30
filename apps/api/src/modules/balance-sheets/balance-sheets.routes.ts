import type { FastifyInstance } from "fastify";
import {
  UploadBalanceSheetSchema,
  MAX_PDF_SIZE_BYTES,
} from "./balance-sheets.schema.js";
import { publishBalanceSheet } from "./balance-sheets.service.js";
import {
  validatePdfMagicBytes,
  InvalidPdfMagicBytesError,
} from "../../lib/file-validation.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function balanceSheetAdminRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * POST /api/clubs/:clubId/balance-sheets
   *
   * Uploads and publishes a PDF balance sheet for the authenticated club.
   * The PDF is stored on disk, its SHA-256 hash is recorded for tamper-evidence,
   * and the row is written to the tenant's balance_sheets table.
   *
   * The published document is immediately visible on the public transparency page.
   *
   * Authorization: ADMIN role required.
   *
   * Multipart body:
   *   - file field "pdf"  (required, .pdf extension, ≤ 10 MB)
   *   - field "title"     (required, 2–200 chars)
   *   - field "period"    (required, 2–100 chars, e.g. "2024" or "1º Trimestre 2025")
   *
   * Errors:
   *   400 — missing file / wrong extension / field validation failure / file > 10 MB
   *   403 — authenticated user is TREASURER
   *   404 — clubId does not match the authenticated club
   *   422 — file bytes are not valid PDF (magic bytes check)
   */
  fastify.post(
    "/:clubId/balance-sheets",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { clubId } = request.params as { clubId: string };
      const { clubId: authClubId } = request.user as AccessTokenPayload;

      if (clubId !== authClubId) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Clube não encontrado.",
        });
      }

      let part;
      try {
        part = await request.file({ limits: { fileSize: MAX_PDF_SIZE_BYTES } });
      } catch (err) {
        const e = err as { statusCode?: number };
        if (e.statusCode === 413) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Arquivo excede o limite de 10 MB.",
          });
        }
        throw err;
      }

      if (!part) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Arquivo PDF não enviado.",
        });
      }

      const filename = (part.filename ?? "").toLowerCase();
      if (!filename.endsWith(".pdf")) {
        await part.toBuffer().catch(() => {});
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Apenas arquivos com extensão .pdf são aceitos.",
        });
      }

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await part.toBuffer();
      } catch (err) {
        const e = err as { statusCode?: number };
        if (e.statusCode === 413) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Arquivo excede o limite de 10 MB.",
          });
        }
        throw err;
      }

      try {
        validatePdfMagicBytes(pdfBuffer);
      } catch (err) {
        if (err instanceof InvalidPdfMagicBytesError) {
          return reply.status(422).send({
            statusCode: 422,
            error: "Unprocessable Entity",
            message: err.message,
          });
        }
        throw err;
      }

      const fields = part.fields as Record<
        string,
        { value: string } | undefined
      >;
      const rawBody = {
        title: fields["title"]?.value ?? "",
        period: fields["period"]?.value ?? "",
      };

      const parsed = UploadBalanceSheetSchema.safeParse(rawBody);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            parsed.error.issues[0]?.message ?? "Dados de entrada inválidos.",
        });
      }

      const sheet = await publishBalanceSheet(
        fastify.prisma,
        clubId,
        request.actorId,
        parsed.data,
        pdfBuffer,
      );

      return reply.status(201).send(sheet);
    },
  );
}
