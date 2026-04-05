import type { FastifyInstance } from "fastify";
import { RecordParentalConsentSchema } from "./tryout-consent.schema.js";
import { recordParentalConsent } from "./tryout-consent.service.js";
import { CURRENT_CONSENT_VERSION, CONSENT_VERSIONS } from "./consent-text.js";
import { NotFoundError } from "../../lib/errors.js";

export async function tryoutConsentRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * POST /api/public/tryout-consent
   *
   * Records a guardian's digital parental consent for a minor athlete.
   * No authentication required — public endpoint.
   *
   * Body (JSON):
   *   clubSlug            string  — identifies the club (and tenant schema)
   *   athleteName         string  — athlete being registered
   *   guardianName        string  — full name of the consenting guardian
   *   guardianPhone       string  — digits only, 10–11 chars
   *   guardianRelationship enum   — mae|pai|avo|tio|outro
   *   consentVersion      string  — must equal the current version (v1.0)
   *
   * Response 201:
   *   { consentId, consentToken, issuedAt }
   *   consentToken is a short-lived HMAC token (TTL 2 hours) the frontend
   *   must append to the tryout form submission as the field "consentToken".
   *
   * Response 400:
   *   Invalid payload or wrong consentVersion.
   * Response 404:
   *   clubSlug does not match any registered club.
   *
   * Audit:
   *   Writes PARENTAL_CONSENT_RECORDED to the tenant's audit_log with
   *   SHA-256 of the full consent payload, hashed guardian phone, IP, and UA.
   *
   * Rate limiting: subject to the global 100 req/min per IP limit.
   */
  fastify.post("/tryout-consent", async (request, reply) => {
    const parsed = RecordParentalConsentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          parsed.error.issues[0]?.message ?? "Dados de entrada inválidos.",
      });
    }

    if (parsed.data.consentVersion !== CURRENT_CONSENT_VERSION) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: `Versão do termo de consentimento inválida. Use "${CURRENT_CONSENT_VERSION}".`,
      });
    }

    const ipAddress =
      (request.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        ?.trim() ??
      request.ip ??
      "unknown";

    const userAgent = request.headers["user-agent"] ?? "unknown";

    try {
      const result = await recordParentalConsent(
        fastify.prisma,
        parsed.data,
        ipAddress,
        userAgent,
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
      throw err;
    }
  });

  /**
   * GET /api/public/consent-text/:version
   *
   * Returns the full text and metadata of a consent document version.
   * Used by the frontend to display the canonical text before recording.
   *
   * This ensures the guardian always reads the server-authoritative version,
   * even if the frontend bundle is temporarily out of sync after a deploy.
   *
   * Response 200: { version, effectiveDate, text }
   * Response 404: version string not found in CONSENT_VERSIONS
   */
  fastify.get("/consent-text/:version", async (request, reply) => {
    const { version } = request.params as { version: string };
    const doc = CONSENT_VERSIONS[version as keyof typeof CONSENT_VERSIONS];

    if (!doc) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Versão do termo não encontrada.",
      });
    }

    return reply.status(200).send({
      version: doc.version,
      effectiveDate: doc.effectiveDate,
      text: doc.text,
    });
  });
}
