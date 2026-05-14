import { Prisma } from "../../../../generated/prisma/index.js";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import type {
  PaginatedResponse,
  ScoutAthleteProfile,
  ScoutAthleteResult,
  ShowcaseSnapshot,
  ShowcaseTier,
} from "@clubos/shared-types";
import type { SearchAthletesQuery } from "./search.schema.js";

type SearchRow = {
  id: string;
  clubId: string;
  athleteId: string;
  tier: string;
  snapshot: unknown;
  video_count: number;
};

function toInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => (w[0] ?? "").toUpperCase())
    .join("");
}

function isActiveSubscription(status: string, expiresAt: Date | null): boolean {
  return status === "ACTIVE" && expiresAt != null && expiresAt > new Date();
}

function projectRow(
  row: SearchRow,
  isPremiumScout: boolean,
): ScoutAthleteResult {
  const snap = row.snapshot as ShowcaseSnapshot;
  const canSeeFull = isPremiumScout && row.tier === "PREMIUM";

  return {
    id: row.id,
    athleteId: row.athleteId,
    clubId: row.clubId,
    tier: row.tier as ShowcaseTier,
    nameInitials: toInitials(snap.name),
    position: snap.position,
    ageYears: snap.ageYears,
    state: snap.state ?? null,
    rtpStatus: snap.rtpStatus,
    acwrTrend: canSeeFull ? snap.acwrTrend : null,
    evaluationScores: canSeeFull ? snap.evaluationScores : null,
    videoCount: canSeeFull ? row.video_count : null,
    upgrade_required: !canSeeFull,
  };
}

export async function searchAthletes(
  prisma: PrismaClient,
  scoutId: string,
  params: SearchAthletesQuery,
): Promise<PaginatedResponse<ScoutAthleteResult>> {
  const scout = await prisma.scoutProfile.findUnique({
    where: { id: scoutId },
    select: { subscriptionStatus: true, subscriptionExpiresAt: true },
  });

  const isPremiumScout =
    scout != null &&
    isActiveSubscription(scout.subscriptionStatus, scout.subscriptionExpiresAt);

  const {
    page,
    limit,
    position,
    minAge,
    maxAge,
    state,
    rtpStatus,
    minAcwr,
    maxAcwr,
  } = params;
  const skip = (page - 1) * limit;

  const posFilter = position
    ? Prisma.sql`AND ss.snapshot->>'position' = ${position}`
    : Prisma.sql``;
  const rtpFilter = rtpStatus
    ? Prisma.sql`AND ss.snapshot->>'rtpStatus' = ${rtpStatus}`
    : Prisma.sql``;
  const stateFilter = state
    ? Prisma.sql`AND ss.snapshot->>'state' = ${state}`
    : Prisma.sql``;
  const minAgeF =
    minAge != null
      ? Prisma.sql`AND (ss.snapshot->>'ageYears')::integer >= ${minAge}`
      : Prisma.sql``;
  const maxAgeF =
    maxAge != null
      ? Prisma.sql`AND (ss.snapshot->>'ageYears')::integer <= ${maxAge}`
      : Prisma.sql``;
  const minAcwrF =
    minAcwr != null
      ? Prisma.sql`AND (ss.snapshot->'acwrTrend'->-1->>'acwrRatio')::numeric >= ${minAcwr}`
      : Prisma.sql``;
  const maxAcwrF =
    maxAcwr != null
      ? Prisma.sql`AND (ss.snapshot->'acwrTrend'->-1->>'acwrRatio')::numeric <= ${maxAcwr}`
      : Prisma.sql``;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<SearchRow[]>`
      SELECT
        ss.id,
        ss."clubId",
        ss."athleteId",
        ss.tier::text,
        ss.snapshot,
        COUNT(sv.id)::integer AS video_count
      FROM scout_showcases ss
      LEFT JOIN showcase_videos sv
        ON sv."athleteId" = ss."athleteId"
       AND sv."clubId"    = ss."clubId"
      WHERE ss."isPublished" = true
        ${posFilter}
        ${rtpFilter}
        ${stateFilter}
        ${minAgeF}
        ${maxAgeF}
        ${minAcwrF}
        ${maxAcwrF}
      GROUP BY ss.id
      ORDER BY ss."publishedAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM scout_showcases ss
      WHERE ss."isPublished" = true
        ${posFilter}
        ${rtpFilter}
        ${stateFilter}
        ${minAgeF}
        ${maxAgeF}
        ${minAcwrF}
        ${maxAcwrF}
    `,
  ]);

  return {
    data: rows.map((r) => projectRow(r, isPremiumScout)),
    total: Number(countRows[0]?.count ?? 0),
    page,
    limit,
  };
}

type ProfileRow = SearchRow & {
  snapshot_hash: string;
  is_published: boolean;
  videos: Array<{
    id: string;
    r2_key: string;
    duration_seconds: number;
    thumbnail_url: string | null;
    order: number;
  }>;
};

export async function getAthletePublicProfile(
  prisma: PrismaClient,
  scoutId: string,
  showcaseId: string,
): Promise<ScoutAthleteProfile | null> {
  const scout = await prisma.scoutProfile.findUnique({
    where: { id: scoutId },
    select: { subscriptionStatus: true, subscriptionExpiresAt: true },
  });

  const isPremiumScout =
    scout != null &&
    isActiveSubscription(scout.subscriptionStatus, scout.subscriptionExpiresAt);

  const rows = await prisma.$queryRaw<ProfileRow[]>`
    SELECT
      ss.id,
      ss."clubId",
      ss."athleteId",
      ss.tier::text,
      ss.snapshot,
      ss."snapshotHash"  AS snapshot_hash,
      ss."isPublished"   AS is_published,
      COALESCE(
        json_agg(
          json_build_object(
            'id',               sv.id,
            'r2_key',           sv."r2Key",
            'duration_seconds', sv."durationSeconds",
            'thumbnail_url',    sv."thumbnailUrl",
            'order',            sv."order"
          ) ORDER BY sv."order"
        ) FILTER (WHERE sv.id IS NOT NULL),
        '[]'
      ) AS videos,
      COUNT(sv.id)::integer AS video_count
    FROM scout_showcases ss
    LEFT JOIN showcase_videos sv
      ON sv."athleteId" = ss."athleteId"
     AND sv."clubId"    = ss."clubId"
    WHERE ss.id = ${showcaseId}
    GROUP BY ss.id
  `;

  const row = rows[0];
  if (!row || !row.is_published) return null;

  const base = projectRow(row, isPremiumScout);
  const canSeeFull = isPremiumScout && row.tier === "PREMIUM";

  return {
    ...base,
    snapshotHash: row.snapshot_hash,
    snapshotBuiltAt: (row.snapshot as ShowcaseSnapshot).snapshotBuiltAt,
    videos: canSeeFull
      ? row.videos.map((v) => ({
          id: v.id,
          r2Key: v.r2_key,
          durationSeconds: v.duration_seconds,
          thumbnailUrl: v.thumbnail_url,
          order: v.order,
        }))
      : null,
  };
}
