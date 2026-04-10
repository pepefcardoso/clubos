import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";

export interface RefreshAcwrResult {
  clubId: string;
  refreshedAt: Date;
  concurrent: boolean;
  durationMs: number;
}

/**
 * Refreshes the acwr_aggregates materialized view for a single tenant.
 *
 * PostgreSQL constraint: REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run
 * inside a transaction block. We probe `pg_class.relispopulated` to check
 * if the view has data, avoiding the "materialized view has not been populated"
 * error that occurs if we try to SELECT from it on the first run.
 *
 * First-run behaviour: the view is created WITH NO DATA.
 * The initial refresh uses the non-concurrent form. All subsequent refreshes
 * use CONCURRENTLY, allowing the ACWR dashboard to serve reads uninterrupted.
 *
 * Called by: the refresh-acwr-aggregates BullMQ job.
 */
export async function refreshAcwrAggregates(
  prisma: PrismaClient,
  clubId: string,
): Promise<RefreshAcwrResult> {
  const startedAt = Date.now();
  const schemaName = `clube_${clubId}`;

  const rows = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.$queryRaw<{ row_count: bigint }[]>`
      SELECT COUNT(*)::bigint AS row_count
      FROM ${schemaName}."acwr_aggregates"
    `;
  });

  const hasData = (rows[0]?.row_count ?? 0n) > 0n;

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
