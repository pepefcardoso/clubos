import type { FastifyInstance } from "fastify";
import { ConflictError, NotFoundError } from "../../../lib/errors.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";
import type {
  ClubContactRequestItem,
  ClubContactRequestsResponse,
  ContactRequestStatus,
  ShowcaseSnapshot,
} from "@clubos/shared-types";
import { RespondContactRequestSchema } from "./contact-response.schema.js";
import { respondToContactRequest } from "./contact-response.service.js";

export async function contactResponseRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get<{ Reply: ClubContactRequestsResponse }>(
    "/",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const clubId = user.clubId!;

      const rows = await fastify.prisma.contactRequest.findMany({
        where: { clubId },
        orderBy: { createdAt: "desc" },
        include: {
          scout: { select: { name: true, specialization: true } },
        },
      });

      if (rows.length === 0) {
        return reply.send({ pending: [], accepted: [], rejected: [] });
      }

      const rejectedIds = rows
        .filter((r) => r.status === "REJECTED")
        .map((r) => r.id);

      const reasonMap = new Map<string, string>();
      if (rejectedIds.length > 0) {
        const logRows = await fastify.prisma.$queryRaw<
          Array<{ contact_request_id: string; reason: string | null }>
        >`
          SELECT
            metadata->>'contactRequestId' AS contact_request_id,
            metadata->>'reason'           AS reason
          FROM communication_log
          WHERE event_type = 'CONTACT_REJECTED'
            AND metadata->>'contactRequestId' = ANY(${rejectedIds})
          ORDER BY created_at DESC
        `;
        for (const lr of logRows) {
          if (lr.contact_request_id && !reasonMap.has(lr.contact_request_id)) {
            reasonMap.set(lr.contact_request_id, lr.reason ?? "");
          }
        }
      }

      const athleteIds = [...new Set(rows.map((r) => r.athleteId))];
      const showcases = await fastify.prisma.scoutShowcase.findMany({
        where: { athleteId: { in: athleteIds }, clubId },
        select: { athleteId: true, snapshot: true },
      });

      const snapshotMap = new Map(
        showcases.map((s) => [
          s.athleteId,
          s.snapshot as Pick<ShowcaseSnapshot, "name" | "position"> | undefined,
        ]),
      );

      const items: ClubContactRequestItem[] = rows.map((r) => {
        const snap = snapshotMap.get(r.athleteId);
        return {
          id: r.id,
          scoutId: r.scoutId,
          scoutName: r.scout?.name ?? "Scout desconhecido",
          scoutSpecialization: r.scout?.specialization ?? null,
          athleteId: r.athleteId,
          athleteName: snap?.name ?? "Atleta desconhecido",
          athletePosition: snap?.position ?? null,
          status: r.status as ContactRequestStatus,
          scoutReason: r.reason ?? null,
          responseReason: reasonMap.get(r.id) ?? null,
          createdAt: r.createdAt.toISOString(),
          respondedAt:
            r.status !== "PENDING" ? r.updatedAt.toISOString() : null,
        };
      });

      return reply.send({
        pending: items.filter((i) => i.status === "PENDING"),
        accepted: items.filter((i) => i.status === "ACCEPTED"),
        rejected: items.filter((i) => i.status === "REJECTED"),
      });
    },
  );

  fastify.patch<{ Params: { contactRequestId: string } }>(
    "/:contactRequestId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { contactRequestId } = request.params;
      const user = request.user as AccessTokenPayload;

      const parsed = RespondContactRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
        });
      }

      const ip =
        (request.headers["x-forwarded-for"] as string | undefined)
          ?.split(",")[0]
          ?.trim() ?? request.ip;

      try {
        const result = await respondToContactRequest(
          fastify.prisma,
          contactRequestId,
          user.clubId!,
          user.sub,
          parsed.data,
          ip,
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
