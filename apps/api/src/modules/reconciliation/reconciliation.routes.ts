import type { FastifyInstance } from "fastify";
import { OfxParseError } from "./reconciliation.schema.js";
import { parseOfxFile } from "./reconciliation.parser.js";

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
   * No data is persisted — the response feeds the T-099 matching UI directly.
   * The caller should pass transactions[] to the matching algorithm without
   * re-uploading the file.
   *
   * Access:  ADMIN only (financial operation per RBAC matrix).
   * Auth:    Provided by the protectedRoutes plugin-level verifyAccessToken hook.
   * Tenant:  clubId is available from request.user but not used here (no DB writes).
   *
   * Errors:
   *   400 — no file uploaded
   *   400 — file exceeds 2 MB
   *   400 — invalid file extension (must be .ofx)
   *   422 — valid OFX file but content could not be parsed (OfxParseError)
   *
   * Response: ParsedOfxStatement serialised to JSON
   *   (Dates become ISO 8601 strings via JSON.stringify)
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
}
