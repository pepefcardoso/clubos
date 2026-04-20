import {
  getPendingScans,
  markScanSyncing,
  markScanSynced,
  markScanError,
} from "@/lib/db/field-access.db";
import { validateAccess, FieldAccessApiError } from "@/lib/api/field-access";

export interface FieldAccessSyncResult {
  synced: number;
  failed: number;
}

/**
 * Flushes all pending QR Code scans for a club to the server.
 *
 * Design principles (mirrors flushPendingSessions in sync-worker.ts):
 * - Each scan is attempted independently — one failure does not abort others.
 * - `localId` is used as `idempotencyKey` — server deduplicates on retry.
 * - Marks `syncing` before the request to prevent concurrent duplicate sends.
 * - Sequential processing: avoids overwhelming a slow connection.
 * - Stops mid-flush if `navigator.onLine` becomes false.
 *
 * 4xx errors (bad token, auth expired) are permanent failures and are marked
 * as `error` immediately — no retry.
 * Network errors are also marked as `error` so the next reconnect event
 * can retry via `resetErroredScans`.
 *
 * Called from:
 *   - `AccessScannerPage` on the `online` event
 *   - `useSyncWorker` hook (if extended to cover field-access)
 */
export async function flushPendingScans(
  clubId: string,
  getAccessToken: () => Promise<string | null>,
): Promise<FieldAccessSyncResult> {
  const pending = await getPendingScans(clubId);
  if (pending.length === 0) return { synced: 0, failed: 0 };

  const token = await getAccessToken();
  if (!token) {
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const scan of pending) {
    if (!navigator.onLine) break;

    await markScanSyncing(scan.localId);

    try {
      const result = await validateAccess(
        scan.eventId,
        {
          token: scan.token,
          idempotencyKey: scan.localId,
          scannedAt: scan.scannedAt,
        },
        token,
      );
      await markScanSynced(scan.localId, result.accessLogId);
      synced++;
    } catch (err) {
      const message =
        err instanceof FieldAccessApiError
          ? `HTTP ${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Network error";
      await markScanError(scan.localId, message);
      failed++;
    }
  }

  return { synced, failed };
}
