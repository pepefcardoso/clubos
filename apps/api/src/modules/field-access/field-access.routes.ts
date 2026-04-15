import type { FastifyInstance } from "fastify";
import { ValidateAccessSchema } from "./field-access.schema.js";
import { validateFieldAccess } from "./field-access.service.js";
import { getEnv } from "../../lib/env.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

/**
 * Field Access QR Code validation routes.
 *
 * Mounted under /api/events inside protectedRoutes — verifyAccessToken
 * is applied automatically by the plugin-level hook.
 *
 * All route handlers return HTTP 200 regardless of QR Code validity.
 * Invalid tokens produce `{ valid: false, reason: string }` — consistent
 * with the member card verification design (prevents information leakage
 * via HTTP status codes).
 */
export async function fieldAccessRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * POST /api/events/:eventId/access/validate
   *
   * Validates a QR Code access token and records the result.
   *
   * Supports offline Background Sync deduplication via `idempotencyKey`.
   * A scanner app that queues offline scans and replays them on reconnect
   * can safely retry — duplicate submissions return the original result.
   *
   * Access: ADMIN, TREASURER (all authenticated users — gate staff
   *         will use an account provided by the club admin).
   * Errors:  400 (malformed body), 401 (no/invalid access token).
   *
   * Note: HTTP 200 is returned even for invalid QR codes. The `valid`
   * field in the response body is the authoritative validity indicator.
   */
  fastify.post("/:eventId/access/validate", async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const { clubId } = request.user as AccessTokenPayload;
    const { ACCESS_QR_SECRET } = getEnv();

    const parsed = ValidateAccessSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const result = await validateFieldAccess(fastify.prisma, {
      clubId,
      actorId: request.actorId,
      eventId,
      input: parsed.data,
      secret: ACCESS_QR_SECRET,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });

    return reply.status(200).send(result);
  });
}
