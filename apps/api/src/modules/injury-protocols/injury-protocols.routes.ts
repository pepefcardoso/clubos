import type { FastifyInstance } from "fastify";
import { ListInjuryProtocolsQuerySchema } from "./injury-protocols.schema.js";
import {
  listInjuryProtocols,
  getInjuryProtocolById,
  InjuryProtocolNotFoundError,
} from "./injury-protocols.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

/**
 * Injury protocol routes — read-only, accessible to all authenticated roles.
 *
 * No `requireRole` guard: the protocol library is clinical reference data
 * (FIFA Medical standard protocols), not sensitive clinical records.
 * No LGPD personal data is exposed — protocols contain only rehabilitation
 * step descriptions and duration metadata.
 *
 * Mounted under /api/injury-protocols in protected.routes.ts.
 *
 * Routes:
 *   GET /api/injury-protocols            → paginated list of protocol summaries
 *   GET /api/injury-protocols/:protocolId → full protocol detail with steps[]
 */
export async function injuryProtocolRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/injury-protocols
   *
   * Returns a paginated list of protocol summaries (steps excluded).
   * Default filter: isActive=true.
   *
   * Query params:
   *   structure  — filter by anatomical structure (e.g. "Hamstring")
   *   grade      — filter by InjuryGrade enum value
   *   isActive   — include inactive protocols (default: true)
   *   page       — pagination page (default: 1)
   *   limit      — results per page, max 100 (default: 50)
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListInjuryProtocolsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Parâmetros inválidos",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;
    const result = await listInjuryProtocols(
      fastify.prisma,
      clubId,
      parsed.data,
    );
    return reply.status(200).send(result);
  });

  /**
   * GET /api/injury-protocols/:protocolId
   *
   * Returns the full protocol detail including the steps array.
   * Returns 404 for unknown or inactive protocols — existence of inactive
   * protocols is not revealed to callers (consistent with IDOR prevention).
   */
  fastify.get("/:protocolId", async (request, reply) => {
    const { protocolId } = request.params as { protocolId: string };
    const { clubId } = request.user as AccessTokenPayload;

    try {
      const protocol = await getInjuryProtocolById(
        fastify.prisma,
        clubId,
        protocolId,
      );
      return reply.status(200).send(protocol);
    } catch (err) {
      if (err instanceof InjuryProtocolNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: err.message,
        });
      }
      throw err;
    }
  });
}
