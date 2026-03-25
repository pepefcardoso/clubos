import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";

export interface RefreshAcwrResult {
  clubId: string;
  refreshedAt: Date;
  /** true when CONCURRENTLY was used (reads not blocked during refresh). */
  concurrent: boolean;
  durationMs: number;
}

/**
 * Refreshes the acwr_aggregates materialized view for a single tenant.
 *
 * PostgreSQL constraint: REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run
 * inside a transaction block. The probe (row count check) runs inside a
 * transaction via withTenantSchema. The REFRESH itself runs as a raw
 * statement on the root prisma client — outside any transaction — using a
 * schema-qualified table name to avoid search_path dependence.
 *
 * First-run behaviour: the view is created WITH NO DATA.
 * The initial refresh uses the non-concurrent form (locking but fast since
 * workload_metrics is typically empty on first run). All subsequent refreshes
 * use CONCURRENTLY, allowing the ACWR dashboard to serve reads uninterrupted.
 *
 * Called by: the refresh-acwr-aggregates BullMQ job.
 *
 * @param prisma  Global Prisma client (public-schema connection).
 * @param clubId  Tenant club ID used to derive the schema name.
 */
export async function refreshAcwrAggregates(
  prisma: PrismaClient,
  clubId: string,
): Promise<RefreshAcwrResult> {
  const startedAt = Date.now();
  const schemaName = `clube_${clubId}`;

  const hasData = await withTenantSchema(prisma, clubId, async (tx) => {
    const result = await tx.$queryRaw<[{ row_count: bigint }]>`
      SELECT COUNT(*)::bigint AS row_count FROM acwr_aggregates LIMIT 1
    `;
    return Number(result[0]?.row_count ?? 0) > 0;
  });

  if (hasData) {
    await prisma.$executeRawUnsafe(
      `REFRESH MATERIALIZED VIEW CONCURRENTLY "${schemaName}"."acwr_aggregates"`,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `REFRESH MATERIALIZED VIEW "${schemaName}"."acwr_aggregates"`,
    );
  }

  return {
    clubId,
    refreshedAt: new Date(),
    concurrent: hasData,
    durationMs: Date.now() - startedAt,
  };
}
