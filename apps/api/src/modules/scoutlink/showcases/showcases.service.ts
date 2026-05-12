import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { Prisma } from "../../../../generated/prisma/index.js";
import { withTenantSchema } from "../../../lib/prisma.js";
import { assertAthleteExists } from "../../../lib/assert-tenant-ownership.js";
import { assertLongitudinalDataSufficient } from "./showcase.service.js";
import { appendCommunicationLog } from "../communication/communication-log.service.js";
import { emitShowcaseUpdated } from "../../../lib/sse-bus.js";
import type { ShowcaseTier, ShowcaseSnapshot } from "@clubos/shared-types";

type AcwrSnapshotRow = {
  date: Date;
  acwr_ratio: string | null;
  risk_zone: string;
  acute_load_au: string;
  chronic_load_au: string;
};

export interface ShowcaseResponse {
  id: string;
  clubId: string;
  athleteId: string;
  tier: ShowcaseTier;
  snapshot: ShowcaseSnapshot;
  snapshotHash: string;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function computeAgeYears(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

/**
 * Stable hash: keys are sorted so scouts can reproduce the hash client-side
 * from the returned snapshot object without knowing insertion order.
 */
function computeSnapshotHash(snapshot: ShowcaseSnapshot): string {
  const stable = JSON.stringify(
    snapshot,
    Object.keys(snapshot).sort() as string[],
  );
  return createHash("sha256").update(stable).digest("hex");
}

function toShowcaseResponse(row: {
  id: string;
  clubId: string;
  athleteId: string;
  tier: string;
  snapshot: Prisma.JsonValue;
  snapshotHash: string;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ShowcaseResponse {
  return {
    id: row.id,
    clubId: row.clubId,
    athleteId: row.athleteId,
    tier: row.tier as ShowcaseTier,
    snapshot: row.snapshot as unknown as ShowcaseSnapshot,
    snapshotHash: row.snapshotHash,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Reads from the tenant schema via withTenantSchema.
 * NEVER includes clinicalNotes, diagnosis, or treatmentDetails. [SEC]
 */
async function buildSnapshot(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
): Promise<ShowcaseSnapshot> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const [athlete, rtp, latestEval, acwrRows] = await Promise.all([
      tx.athlete.findUniqueOrThrow({
        where: { id: athleteId },
        select: { id: true, name: true, position: true, birthDate: true },
      }),
      tx.returnToPlay.findUnique({
        where: { athleteId },
        select: { status: true },
      }),
      tx.technicalEvaluation.findFirst({
        where: { athleteId },
        orderBy: { date: "desc" },
        select: {
          technique: true,
          tactical: true,
          physical: true,
          mental: true,
          attitude: true,
        },
      }),
      tx.$queryRaw<AcwrSnapshotRow[]>`
        SELECT date, acwr_ratio, risk_zone, acute_load_au, chronic_load_au
        FROM acwr_aggregates
        WHERE "athleteId" = ${athleteId}
          AND date >= CURRENT_DATE - INTERVAL '28 days'
        ORDER BY date ASC
      `,
    ]);

    return {
      athleteId: athlete.id,
      clubId,
      name: athlete.name,
      position: athlete.position,
      ageYears: computeAgeYears(athlete.birthDate),
      dominantFoot: null, // TODO: [T-185] — add dominantFoot to athlete schema
      rtpStatus: rtp?.status ?? null,
      acwrTrend: acwrRows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        acwrRatio: r.acwr_ratio !== null ? Number(r.acwr_ratio) : null,
        riskZone: r.risk_zone,
        acuteLoadAu: Number(r.acute_load_au),
        chronicLoadAu: Number(r.chronic_load_au),
      })),
      evaluationScores: latestEval ?? null,
      snapshotBuiltAt: new Date().toISOString(),
    };
  });
}

export async function publishShowcase(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
  actorId: string,
  tier: ShowcaseTier,
): Promise<ShowcaseResponse> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    await assertAthleteExists(tx, athleteId);
  });

  await assertLongitudinalDataSufficient(prisma, clubId, athleteId, tier);

  const snapshot = await buildSnapshot(prisma, clubId, athleteId);
  const snapshotHash = computeSnapshotHash(snapshot);

  const now = new Date();
  const showcase = await prisma.scoutShowcase.upsert({
    where: { clubId_athleteId: { clubId, athleteId } },
    update: {
      tier,
      snapshot: snapshot as unknown as Prisma.JsonObject,
      snapshotHash,
      isPublished: true,
      publishedAt: now,
      updatedAt: now,
    },
    create: {
      id: randomUUID(),
      clubId,
      athleteId,
      tier,
      snapshot: snapshot as unknown as Prisma.JsonObject,
      snapshotHash,
      isPublished: true,
      publishedAt: now,
    },
  });

  await appendCommunicationLog(prisma, {
    actorId,
    actorRole: "ADMIN",
    targetId: athleteId,
    eventType: "SHOWCASE_PUBLISHED",
    metadata: { showcaseId: showcase.id, tier },
  });

  emitShowcaseUpdated(clubId, { showcaseId: showcase.id, athleteId, tier });

  return toShowcaseResponse(showcase);
}

/**
 * ADMIN: scoped to their clubId (from JWT).
 * SCOUT: resolves by athleteId from public schema; only returns published showcases.
 *        clubId is null in SCOUT JWT — never call withTenantSchema from this path. [SEC-TEN]
 */
export async function getShowcaseForAdmin(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
): Promise<ShowcaseResponse | null> {
  const row = await prisma.scoutShowcase.findUnique({
    where: { clubId_athleteId: { clubId, athleteId } },
  });
  return row ? toShowcaseResponse(row) : null;
}

export async function getShowcaseForScout(
  prisma: PrismaClient,
  athleteId: string,
): Promise<ShowcaseResponse | null> {
  const row = await prisma.scoutShowcase.findFirst({
    where: { athleteId, isPublished: true },
  });
  return row ? toShowcaseResponse(row) : null;
}
