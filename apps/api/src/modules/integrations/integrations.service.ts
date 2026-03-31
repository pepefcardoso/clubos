import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError, UnauthorizedError } from "../../lib/errors.js";
import { recordWorkloadMetric } from "../workload/workload.service.js";
import type {
  CreateIntegrationTokenInput,
  NormalizedWorkloadPayload,
} from "./integrations.schema.js";

const BCRYPT_ROUNDS = 10;

export interface CreatedTokenResult {
  id: string;
  athleteId: string;
  label: string;
  /** Shown ONCE — not retrievable afterwards */
  plainToken: string;
  createdAt: Date;
}

export interface IntegrationTokenSummary {
  id: string;
  athleteId: string;
  athleteName: string;
  label: string;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/**
 * Creates a new integration token for an athlete.
 * Returns the plain token exactly once — it is NOT stored anywhere after this call.
 */
export async function createIntegrationToken(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateIntegrationTokenInput,
): Promise<CreatedTokenResult> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const athlete = await tx.athlete.findUnique({
      where: { id: input.athleteId },
      select: { id: true, name: true },
    });
    if (!athlete) throw new NotFoundError("Atleta não encontrado.");

    const plainToken = randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(plainToken, BCRYPT_ROUNDS);

    const token = await tx.integrationToken.create({
      data: {
        athleteId: input.athleteId,
        tokenHash,
        label: input.label,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "ATHLETE_UPDATED",
        entityId: token.id,
        entityType: "IntegrationToken",
        metadata: {
          label: input.label,
          athleteId: input.athleteId,
          athleteName: athlete.name,
        },
      },
    });

    return {
      id: token.id,
      athleteId: token.athleteId,
      label: token.label,
      plainToken,
      createdAt: token.createdAt,
    };
  });
}

/**
 * Verifies a raw integration token against stored hashes for a club.
 * Returns the athleteId + tokenId on success.
 * Throws UnauthorizedError on any failure (timing-safe: always runs bcrypt).
 */
export async function verifyIntegrationToken(
  prisma: PrismaClient,
  clubId: string,
  rawToken: string,
): Promise<{ athleteId: string; tokenId: string }> {
  const tokens = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.integrationToken.findMany({
      where: { isActive: true },
      select: { id: true, athleteId: true, tokenHash: true },
    });
  });

  for (const token of tokens) {
    const matches = await bcrypt.compare(rawToken, token.tokenHash);
    if (matches) {
      void withTenantSchema(prisma, clubId, (tx) =>
        tx.integrationToken.update({
          where: { id: token.id },
          data: { lastUsedAt: new Date() },
        }),
      ).catch(() => {});

      return { athleteId: token.athleteId, tokenId: token.id };
    }
  }

  throw new UnauthorizedError("Token de integração inválido ou revogado.");
}

/**
 * Revokes an integration token (sets isActive = false).
 * Tokens are never hard-deleted — the row remains for audit purposes.
 */
export async function revokeIntegrationToken(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  tokenId: string,
): Promise<void> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    const token = await tx.integrationToken.findUnique({
      where: { id: tokenId },
      select: { id: true, athleteId: true, label: true },
    });
    if (!token) throw new NotFoundError("Token não encontrado.");

    await tx.integrationToken.update({
      where: { id: tokenId },
      data: { isActive: false },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "ATHLETE_UPDATED",
        entityId: tokenId,
        entityType: "IntegrationToken",
        metadata: {
          revoked: true,
          label: token.label,
          athleteId: token.athleteId,
        },
      },
    });
  });
}

/**
 * Lists all integration tokens for a club, joined with athlete names.
 */
export async function listIntegrationTokens(
  prisma: PrismaClient,
  clubId: string,
): Promise<IntegrationTokenSummary[]> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        athleteId: string;
        athlete_name: string;
        label: string;
        isActive: boolean;
        lastUsedAt: Date | null;
        createdAt: Date;
      }>
    >`
      SELECT
        t.id,
        t."athleteId",
        a.name AS athlete_name,
        t.label,
        t."isActive",
        t."lastUsedAt",
        t."createdAt"
      FROM integration_tokens t
      JOIN athletes a ON a.id = t."athleteId"
      ORDER BY t."createdAt" DESC
    `;

    return rows.map((r) => ({
      id: r.id,
      athleteId: r.athleteId,
      athleteName: r.athlete_name,
      label: r.label,
      isActive: r.isActive,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
    }));
  });
}

/**
 * Ingests a normalized workload payload by delegating to recordWorkloadMetric.
 * The actorId uses the tokenId so the audit trail identifies the source device.
 */
export async function ingestWorkloadFromToken(
  prisma: PrismaClient,
  clubId: string,
  tokenId: string,
  payload: NormalizedWorkloadPayload,
): Promise<Awaited<ReturnType<typeof recordWorkloadMetric>>> {
  const actorId = `integration:${tokenId}`;
  return recordWorkloadMetric(prisma, clubId, actorId, {
    athleteId: payload.athleteId,
    date: payload.date,
    rpe: payload.rpe,
    durationMinutes: payload.durationMinutes,
    sessionType: payload.sessionType,
    notes: payload.notes,
    idempotencyKey: payload.idempotencyKey,
  });
}
