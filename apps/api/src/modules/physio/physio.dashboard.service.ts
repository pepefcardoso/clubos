import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { getPhysioClubs } from "./physio.service.js";

export interface MultiClubAtRiskAthlete {
  athleteId: string;
  athleteName: string;
  position: string | null;
  currentAcwr: number;
  currentRiskZone: string;
  lastInjuryStructure: string | null;
  clubId: string;
  clubName: string;
}

export interface MultiClubAtRiskResponse {
  athletes: MultiClubAtRiskAthlete[];
  clubCount: number;
  acwrDataAsOf: string | null;
}

type AcwrRow = {
  athleteId: string;
  acwr_ratio: number | null;
  risk_zone: string;
  date: Date;
};

type AthleteRow = {
  id: string;
  name: string;
  position: string | null;
};

type MedicalRow = {
  athleteId: string;
  structure: string;
};

/**
 * Queries at-risk athletes for a single club tenant schema.
 * Returns athletes whose most recent ACWR is >= minAcwr.
 */
async function getAtRiskForClub(
  tx: PrismaClient,
  minAcwr: number,
): Promise<{
  athletes: Array<Omit<MultiClubAtRiskAthlete, "clubId" | "clubName">>;
  acwrDataAsOf: string | null;
}> {
  const acwrRows = await tx.$queryRaw<AcwrRow[]>`
    SELECT DISTINCT ON ("athleteId")
      "athleteId",
      acwr_ratio,
      risk_zone,
      date
    FROM "acwr_aggregates"
    WHERE acwr_ratio IS NOT NULL
      AND acwr_ratio >= ${minAcwr}
    ORDER BY "athleteId", date DESC
  `;

  if (acwrRows.length === 0) {
    return { athletes: [], acwrDataAsOf: null };
  }

  const athleteIds = acwrRows.map((r) => r.athleteId);

  const [athleteRows, medicalRows] = await Promise.all([
    tx.athlete.findMany({
      where: { id: { in: athleteIds }, status: "ACTIVE" },
      select: { id: true, name: true, position: true },
    }) as Promise<AthleteRow[]>,
    tx.medicalRecord.findMany({
      where: { athleteId: { in: athleteIds } },
      select: { athleteId: true, structure: true },
      orderBy: { occurredAt: "desc" },
      distinct: ["athleteId"],
    }) as Promise<MedicalRow[]>,
  ]);

  const athleteMap = new Map(athleteRows.map((a) => [a.id, a]));
  const lastInjuryMap = new Map(
    medicalRows.map((m) => [m.athleteId, m.structure]),
  );

  const dates = acwrRows.map((r) => r.date.getTime());
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates)) : null;

  const athletes = acwrRows
    .filter((r) => athleteMap.has(r.athleteId))
    .map((r) => {
      const athlete = athleteMap.get(r.athleteId)!;
      return {
        athleteId: r.athleteId,
        athleteName: athlete.name,
        position: athlete.position ?? null,
        currentAcwr: Number(r.acwr_ratio ?? 0),
        currentRiskZone: r.risk_zone,
        lastInjuryStructure: lastInjuryMap.get(r.athleteId) ?? null,
      };
    })
    .sort((a, b) => b.currentAcwr - a.currentAcwr);

  return {
    athletes,
    acwrDataAsOf: maxDate ? maxDate.toISOString() : null,
  };
}

/**
 * Fans out ACWR at-risk athlete queries across all clubs the PHYSIO
 * has access to and returns a consolidated list sorted by ACWR descending.
 * Each entry carries clubId and clubName for UI labeling.
 *
 * Uses Promise.allSettled — a failure in one club does not block others.
 * Clubs that fail are silently excluded from the result set.
 */
export async function getMultiClubAtRiskAthletes(
  prisma: PrismaClient,
  userId: string,
  minAcwr: number,
): Promise<MultiClubAtRiskResponse> {
  const clubs = await getPhysioClubs(prisma, userId);

  const settled = await Promise.allSettled(
    clubs.map(({ clubId, clubName }) =>
      withTenantSchema(prisma, clubId, async (tx) => {
        const { athletes, acwrDataAsOf } = await getAtRiskForClub(tx, minAcwr);
        return {
          athletes: athletes.map((a) => ({ ...a, clubId, clubName })),
          acwrDataAsOf,
        };
      }),
    ),
  );

  let latestDataDate: string | null = null;
  const allAthletes: MultiClubAtRiskAthlete[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      allAthletes.push(...result.value.athletes);
      if (result.value.acwrDataAsOf) {
        if (!latestDataDate || result.value.acwrDataAsOf > latestDataDate) {
          latestDataDate = result.value.acwrDataAsOf;
        }
      }
    }
  }

  allAthletes.sort((a, b) => b.currentAcwr - a.currentAcwr);

  return {
    athletes: allAthletes,
    clubCount: clubs.length,
    acwrDataAsOf: latestDataDate,
  };
}
