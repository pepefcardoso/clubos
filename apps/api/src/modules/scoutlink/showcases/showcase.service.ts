import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { withTenantSchema } from "../../../lib/prisma.js";
import { ConflictError } from "../../../lib/errors.js";
import type { ShowcaseTier, ShowcaseSnapshot } from "@clubos/shared-types";

const LONGITUDINAL_MINIMUM_DAYS = 180;

export class InsufficientLongitudinalDataError extends ConflictError {
  constructor(spanDays: number) {
    super(
      `Dados longitudinais insuficientes: ${spanDays} dias registrados, ` +
        `mínimo de ${LONGITUDINAL_MINIMUM_DAYS} dias exigido para tier PREMIUM.`,
    );
    this.name = "InsufficientLongitudinalDataError";
  }
}

/**
 * Asserts that the athlete has ≥ 180 days of workload_metrics data before
 * a PREMIUM showcase can be published or updated.
 *
 * FREE tier bypasses this guard unconditionally — call site is responsible
 * for passing the correct tier value from the request payload.
 *
 * MUST be called inside the ADMIN's request context; clubId comes from JWT.
 * SCOUT JWT has clubId=null — withTenantSchema will throw before the query. [SEC-TEN]
 *
 * @throws InsufficientLongitudinalDataError (409) when tier=PREMIUM and span < 180d
 */
export async function assertLongitudinalDataSufficient(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
  tier: ShowcaseTier,
): Promise<void> {
  if (tier !== "PREMIUM") return;

  const result = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.$queryRaw<[{ span_days: number | null }]>`
      SELECT (MAX(date) - MIN(date))::integer AS span_days
      FROM workload_metrics
      WHERE "athleteId" = ${athleteId}
    `;
  });

  const spanDays = result[0]?.span_days ?? 0;
  if (spanDays < LONGITUDINAL_MINIMUM_DAYS) {
    throw new InsufficientLongitudinalDataError(spanDays);
  }
}

export interface ProjectedShowcaseFields {
  nameInitials: string;
  position: string | null;
  ageYears: number | null;
  state: string | null;
  rtpStatus: string | null;
  acwrTrend: ShowcaseSnapshot["acwrTrend"] | null;
  evaluationScores: ShowcaseSnapshot["evaluationScores"] | null;
  videoCount: number | null;
  upgrade_required: boolean;
}

function toInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Pure projection — no DB, no withTenantSchema, no side-effects.
 *
 * Ceiling rule  (scout subscription):
 *   isPremiumScout=false → identity fields (position/ageYears/state/rtpStatus) null.
 * Floor rule    (showcase tier):
 *   showcaseTier="FREE"  → analytics fields (acwrTrend/evaluationScores/videoCount) null
 *                          even for a PREMIUM scout.
 * Full depth requires BOTH conditions true.
 * Gated fields are null, never omitted — frontend renders blurred placeholders consistently.
 */
export function projectShowcase(
  snapshot: ShowcaseSnapshot,
  isPremiumScout: boolean,
  showcaseTier: ShowcaseTier,
  videoCount: number,
): ProjectedShowcaseFields {
  const fullDepth = isPremiumScout && showcaseTier === "PREMIUM";

  return {
    nameInitials: toInitials(snapshot.name),
    position: isPremiumScout ? snapshot.position : null,
    ageYears: isPremiumScout ? snapshot.ageYears : null,
    state: isPremiumScout ? (snapshot.state ?? null) : null,
    rtpStatus: isPremiumScout ? snapshot.rtpStatus : null,
    acwrTrend: fullDepth ? snapshot.acwrTrend : null,
    evaluationScores: fullDepth ? snapshot.evaluationScores : null,
    videoCount: fullDepth ? videoCount : null,
    upgrade_required: !fullDepth,
  };
}
