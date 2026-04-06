import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";

export interface LgpdPurgeResult {
  clubId: string;
  deleted: number;
  purgedBefore: Date;
  durationMs: number;
}

/**
 * Hard-deletes PARENTAL_CONSENT_RECORDED audit_log entries older than
 * `purgeBefore` from the tenant schema of `clubId`.
 *
 * Only the 'PARENTAL_CONSENT_RECORDED' action is touched — all other
 * audit_log rows (financial, operational) are immutable by architecture rule.
 *
 * Uses a raw DELETE with RETURNING to get an accurate deleted count without
 * a separate COUNT query. Runs inside withTenantSchema so search_path is
 * set to the correct tenant schema before execution.
 *
 * Why raw SQL instead of prisma.auditLog.deleteMany:
 *   withTenantSchema sets search_path at the transaction level. Using
 *   $queryRaw with DELETE ... RETURNING id is consistent with the pattern
 *   established in workload.service.ts and athletes.service.ts for tenant
 *   schema queries.
 *
 * Idempotent: re-running after a partial failure re-deletes only rows
 * that were not already deleted — a safe retry with no data loss.
 *
 * @param prisma      Global Prisma client (public-schema connection).
 * @param clubId      Tenant club ID used to derive the schema name.
 * @param purgeBefore Cutoff date; rows created before this date are deleted.
 */
export async function purgeExpiredConsentRecords(
  prisma: PrismaClient,
  clubId: string,
  purgeBefore: Date,
): Promise<LgpdPurgeResult> {
  const start = Date.now();

  const rows = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.$queryRaw<Array<{ id: string }>>`
      DELETE FROM audit_log
      WHERE  action      = 'PARENTAL_CONSENT_RECORDED'
        AND  "createdAt" < ${purgeBefore}
      RETURNING id
    `;
  });

  return {
    clubId,
    deleted: rows.length,
    purgedBefore: purgeBefore,
    durationMs: Date.now() - start,
  };
}

/**
 * Computes the cutoff date: midnight UTC, exactly `retentionMonths` ago.
 * Uses UTC month arithmetic to avoid DST edge cases.
 *
 * @example computePurgeCutoff(24, new Date('2025-03-01')) → 2023-03-01T00:00:00.000Z
 *
 * @param retentionMonths  Number of months to subtract from `now`.
 * @param now              Reference date. Defaults to current UTC time. Injected in tests.
 */
export function computePurgeCutoff(
  retentionMonths: number,
  now = new Date(),
): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - retentionMonths,
      now.getUTCDate(),
    ),
  );
}
