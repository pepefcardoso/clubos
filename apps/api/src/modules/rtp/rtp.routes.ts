import type { FastifyInstance } from "fastify";
import { UpdateRtpSchema } from "./rtp.schema.js";
import {
  getRtp,
  upsertRtp,
  AthleteNotFoundError,
  MedicalRecordNotFoundError,
  ProtocolNotFoundError,
} from "./rtp.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

/**
 * Roles that receive the full clinical RTP payload.
 * All other authenticated roles receive { athleteId, status } only.
 */
const CLINICAL_ROLES = new Set<string>(["ADMIN", "PHYSIO"]);

/**
 * RTP sub-routes — mounted under /athletes in protected.routes.ts,
 * producing the final URL shape:
 *   GET /api/athletes/:athleteId/rtp
 *   PUT /api/athletes/:athleteId/rtp
 *
 * GET is accessible by all authenticated roles; projection is role-scoped:
 *   PHYSIO | ADMIN   → full payload (status + clearedAt/By + notes + FKs)
 *   TREASURER | COACH → { athleteId, status } only
 *
 * PUT is restricted to PHYSIO | ADMIN via OR-allowlist preHandler.
 */
export async function rtpRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.verifyAccessToken);

  /**
   * GET /api/athletes/:athleteId/rtp
   *
   * Returns the current RTP status for an athlete.
   * All authenticated roles may call this endpoint — role-based projection
   * is applied inside the handler, not via a preHandler guard.
   *
   * Response shapes:
   *   No record yet: { athleteId, status: null }
   *   TREASURER/COACH: { athleteId, status }
   *   PHYSIO/ADMIN: { athleteId, status, medicalRecordId, protocolId,
   *                   clearedAt, clearedBy, notes, updatedAt }
   *
   * Returns 404 when the athlete does not exist in the tenant schema.
   */
  fastify.get("/:athleteId/rtp", async (request, reply) => {
    const { athleteId } = request.params as { athleteId: string };
    const user = request.user as AccessTokenPayload;

    try {
      const rtp = await getRtp(fastify.prisma, user.clubId, athleteId);

      if (!rtp) {
        return reply.status(200).send({ athleteId, status: null });
      }

      if (CLINICAL_ROLES.has(user.role)) {
        return reply.status(200).send(rtp);
      }

      return reply.status(200).send({
        athleteId: rtp.athleteId,
        status: rtp.status,
      });
    } catch (err) {
      if (err instanceof AthleteNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Atleta não encontrado",
        });
      }
      throw err;
    }
  });

  /**
   * PUT /api/athletes/:athleteId/rtp
   *
   * Creates or updates (upserts) the RTP status for an athlete.
   * Restricted to ADMIN and PHYSIO via OR-allowlist preHandler.
   *
   * Body: { status, medicalRecordId?, protocolId?, notes? }
   *
   * Always returns the full RTP payload (200) on success — the caller is
   * authorised to see clinical fields given the ADMIN/PHYSIO restriction.
   */
  fastify.put(
    "/:athleteId/rtp",
    { preHandler: [fastify.requireRole("ADMIN", "PHYSIO")] },
    async (request, reply) => {
      const { athleteId } = request.params as { athleteId: string };

      const parsed = UpdateRtpSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const user = request.user as AccessTokenPayload;

      try {
        const rtp = await upsertRtp(
          fastify.prisma,
          user.clubId,
          request.actorId,
          athleteId,
          parsed.data,
        );
        return reply.status(200).send(rtp);
      } catch (err) {
        if (err instanceof AthleteNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Atleta não encontrado",
          });
        }
        if (err instanceof MedicalRecordNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Prontuário não encontrado",
          });
        }
        if (err instanceof ProtocolNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Protocolo não encontrado",
          });
        }
        throw err;
      }
    },
  );
}
