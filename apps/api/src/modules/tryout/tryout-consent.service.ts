import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import { issueConsentToken, computeConsentHash } from "./consent-token.js";
import { getConsentText } from "./consent-text.js";
import type {
  RecordParentalConsentInput,
  RecordParentalConsentResponse,
} from "./tryout-consent.schema.js";

/**
 * Records parental consent for a minor athlete in the tenant's audit_log.
 *
 * Steps:
 *   1. Resolve the club from the public schema (slug → clubId).
 *   2. Hash the guardian's phone number (PII minimization — audit_log.metadata
 *      is plain JSONB, not encrypted like member cpf/phone columns).
 *   3. Compute SHA-256 of the full consent payload for tamper-evidence.
 *   4. Write an immutable PARENTAL_CONSENT_RECORDED entry to the tenant schema.
 *   5. Issue a short-lived HMAC token the frontend must include in the final
 *      tryout form submission so the Next.js API route can hard-stop unsigned
 *      submissions for minors.
 *
 * @throws NotFoundError if clubSlug does not resolve to a known club.
 * @throws Re-throws any database errors to the route handler.
 */
export async function recordParentalConsent(
  prisma: PrismaClient,
  input: RecordParentalConsentInput,
  ipAddress: string,
  userAgent: string,
): Promise<RecordParentalConsentResponse> {
  const club = await prisma.club.findUnique({
    where: { slug: input.clubSlug },
    select: { id: true, name: true },
  });

  if (!club) {
    throw new NotFoundError("Clube não encontrado.");
  }

  const consentText = getConsentText(input.consentVersion as "v1.0");
  const issuedAt = new Date();

  const consentHash = computeConsentHash({
    athleteName: input.athleteName,
    guardianName: input.guardianName,
    guardianPhone: input.guardianPhone,
    guardianRelationship: input.guardianRelationship,
    clubSlug: input.clubSlug,
    consentVersion: input.consentVersion,
    consentText,
    issuedAt: issuedAt.toISOString(),
  });

  const guardianPhoneHash = createHash("sha256")
    .update(input.guardianPhone)
    .digest("hex");

  const auditId = randomUUID();

  const auditEntry = await withTenantSchema(prisma, club.id, async (tx) => {
    return tx.auditLog.create({
      data: {
        id: auditId,
        actorId: null,
        memberId: null,
        action: "PARENTAL_CONSENT_RECORDED",
        entityId: auditId,
        entityType: "ParentalConsent",
        metadata: {
          athleteName: input.athleteName,
          guardianName: input.guardianName,
          guardianPhoneHash,
          guardianRelationship: input.guardianRelationship,
          clubSlug: input.clubSlug,
          consentVersion: input.consentVersion,
          consentHash,
          ipAddress,
          userAgent,
          issuedAt: issuedAt.toISOString(),
        },
      },
    });
  });

  const { token } = issueConsentToken(auditEntry.id, club.id);

  return {
    consentId: auditEntry.id,
    consentToken: token,
    issuedAt: issuedAt.toISOString(),
  };
}
