import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { assertAthleteExists } from "../../../lib/assert-tenant-ownership.js";
import { encryptField } from "../../../lib/crypto.js";
import { withTenantSchema } from "../../../lib/prisma.js";
import { getConsentHmacSecret } from "../../tryout/consent-token.js";
import type { RecordParentalConsentInput } from "./parental-consent.schema.js";
import type {
  ParentalConsentStatusResponse,
  RecordParentalConsentResponse,
} from "../../../../../../packages/shared-types/src/index.js";

function computeParentalConsentHash(params: {
  guardianName: string;
  athleteId: string;
  clubId: string;
  recordedAt: string;
}): string {
  const secret = getConsentHmacSecret();
  return createHash("sha256")
    .update(
      `${params.guardianName}|${params.athleteId}|${params.clubId}|${params.recordedAt}|${secret}`,
    )
    .digest("hex");
}

export async function recordParentalConsent(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  athleteId: string,
  input: RecordParentalConsentInput,
  ip: string | undefined,
): Promise<RecordParentalConsentResponse> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    await assertAthleteExists(tx, athleteId);
  });

  const existing = await prisma.parentalConsent.findFirst({
    where: { athleteId, clubId },
    select: { id: true, consentHash: true, createdAt: true },
  });
  if (existing) {
    return {
      consentId: existing.id,
      consentHash: existing.consentHash,
      recordedAt: existing.createdAt.toISOString(),
    };
  }

  const encryptedCpf = await encryptField(prisma, input.guardianCpf);
  const recordedAt = new Date();
  const consentHash = computeParentalConsentHash({
    guardianName: input.guardianName,
    athleteId,
    clubId,
    recordedAt: recordedAt.toISOString(),
  });

  const consent = await prisma.parentalConsent.create({
    data: {
      id: randomUUID(),
      athleteId,
      clubId,
      guardianName: input.guardianName,
      guardianCpf: encryptedCpf,
      consentHash,
      ip: ip ?? null,
    },
  });

  await withTenantSchema(prisma, clubId, async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId,
        action: "PARENTAL_CONSENT_RECORDED",
        entityId: consent.id,
        entityType: "ParentalConsent",
        metadata: { athleteId, clubId, guardianName: input.guardianName },
      },
    });
  });

  return {
    consentId: consent.id,
    consentHash,
    recordedAt: recordedAt.toISOString(),
  };
}

export async function getParentalConsentStatus(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
): Promise<ParentalConsentStatusResponse> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    await assertAthleteExists(tx, athleteId);
  });

  const consent = await prisma.parentalConsent.findFirst({
    where: { athleteId, clubId },
    select: { id: true, createdAt: true },
  });

  if (!consent) return { exists: false };

  return {
    exists: true,
    consentId: consent.id,
    recordedAt: consent.createdAt.toISOString(),
  };
}
