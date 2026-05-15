import type { FastifyInstance } from "fastify";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../lib/errors.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";
import { CreateContactRequestSchema } from "./contact.schema.js";
import { createContactRequest } from "./contact.service.js";
import type {
  ScoutContactRequestItem,
  ContactRequestStatus,
} from "@clubos/shared-types";

export async function contactRequestRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get(
    "/",
    { preHandler: [fastify.verifyAccessToken, fastify.requireRole("SCOUT")] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const scoutId = user.sub;

      const rows = await fastify.prisma.contactRequest.findMany({
        where: { scoutId },
        orderBy: { createdAt: "desc" },
        include: { club: { select: { name: true } } },
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
        where: { athleteId: { in: athleteIds } },
        select: { athleteId: true, snapshot: true },
      });
      const snapshotMap = new Map(
        showcases.map((s) => [s.athleteId, s.snapshot]),
      );

      function toInitials(name: string): string {
        return name
          .split(" ")
          .filter(Boolean)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .slice(0, 2)
          .join("");
      }

      const items: ScoutContactRequestItem[] = rows.map((r) => {
        const snap = snapshotMap.get(r.athleteId) as
          | { name?: string; position?: string | null }
          | undefined;
        return {
          id: r.id,
          athleteId: r.athleteId,
          athleteInitials: snap?.name ? toInitials(snap.name) : "?",
          athletePosition: snap?.position ?? null,
          clubId: r.clubId,
          clubName: r.club.name,
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

  fastify.post(
    "/",
    { preHandler: [fastify.verifyAccessToken, fastify.requireRole("SCOUT")] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;

      const parsed = CreateContactRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const ip =
        (request.headers["x-forwarded-for"] as string | undefined)
          ?.split(",")[0]
          ?.trim() ?? request.ip;

      try {
        const result = await createContactRequest(
          fastify.prisma,
          user.sub,
          parsed.data,
          ip,
        );
        return reply.status(201).send(result);
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
