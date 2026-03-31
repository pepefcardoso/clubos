import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  NormalizedWorkloadPayloadSchema,
  HealthKitPayloadSchema,
  GoogleFitPayloadSchema,
  type NormalizedWorkloadPayload,
} from "./integrations.schema.js";
import {
  verifyIntegrationToken,
  ingestWorkloadFromToken,
} from "./integrations.service.js";
import { normalizeHealthKitPayload } from "./adapters/healthkit.adapter.js";
import { normalizeGoogleFitPayload } from "./adapters/googlefit.adapter.js";
import { UnauthorizedError } from "../../lib/errors.js";

/**
 * Extracts and validates the Bearer integration token from the Authorization header.
 * Returns the raw 64-char hex token string, or null if absent/malformed.
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const raw = authHeader.slice(7).trim();
  if (!/^[0-9a-f]{64}$/.test(raw)) return null;
  return raw;
}

/**
 * Resolves the clubId from the x-club-id request header.
 * Integration tokens are scoped to a single club, so the club must be
 * explicitly identified by the caller — there is no JWT to derive it from.
 */
function extractClubId(request: FastifyRequest): string | null {
  const clubId = request.headers["x-club-id"];
  if (typeof clubId !== "string" || clubId.trim() === "") return null;
  return clubId.trim();
}

export async function integrationIngestRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * POST /api/public/ingest/workload
   *
   * Hardware-agnostic workload ingestion endpoint for wearable devices.
   * Authenticated via Bearer integration token (NOT a JWT access token).
   *
   * Required headers:
   *   Authorization: Bearer <64-char hex token>
   *   x-club-id: <clubId>
   *   x-provider: healthkit | google_fit   (optional; omit for normalized payload)
   *
   * Body (based on x-provider):
   *   - (none / omitted):    NormalizedWorkloadPayload
   *   - healthkit:           HealthKitPayload
   *   - google_fit:          GoogleFitPayload
   *
   * Idempotency:
   *   Supply a 32-char lowercase hex `idempotencyKey` to prevent duplicate
   *   inserts when retrying after a network failure. The server returns the
   *   existing record if the key was seen before.
   *
   * Rate limit: inherits the global 100 req/min per-IP limit.
   */
  fastify.post("/ingest/workload", async (request, reply) => {
    const rawToken = extractBearerToken(request.headers.authorization);
    if (!rawToken) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Token de integração ausente ou malformado.",
      });
    }

    const clubId = extractClubId(request);
    if (!clubId) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Header x-club-id é obrigatório.",
      });
    }

    let tokenId: string;
    try {
      const verified = await verifyIntegrationToken(
        fastify.prisma,
        clubId,
        rawToken,
      );
      tokenId = verified.tokenId;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Token de integração inválido ou revogado.",
        });
      }
      throw err;
    }

    const provider = request.headers["x-provider"];
    let normalized: NormalizedWorkloadPayload;

    if (provider === "healthkit") {
      const parsed = HealthKitPayloadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            parsed.error.issues[0]?.message ?? "Payload HealthKit inválido.",
        });
      }
      normalized = normalizeHealthKitPayload(parsed.data);
    } else if (provider === "google_fit") {
      const parsed = GoogleFitPayloadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message:
            parsed.error.issues[0]?.message ?? "Payload Google Fit inválido.",
        });
      }
      normalized = normalizeGoogleFitPayload(parsed.data);
    } else {
      const parsed = NormalizedWorkloadPayloadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Payload inválido.",
        });
      }
      normalized = parsed.data;
    }

    const result = await ingestWorkloadFromToken(
      fastify.prisma,
      clubId,
      tokenId,
      normalized,
    );

    return reply.status(201).send(result);
  });
}
