import {
  getPendingPosSales,
  markPosSyncing,
  markPosSynced,
  markPosError,
} from "@/lib/db/pos.db";
import { postPosCharge } from "@/lib/api/pos-terminal";

export interface PosSyncResult {
  synced: number;
  failed: number;
}

export async function flushPendingPosSales(
  clubId: string,
  getAccessToken: () => Promise<string | null>,
): Promise<PosSyncResult> {
  const pending = await getPendingPosSales(clubId);
  if (!pending.length) return { synced: 0, failed: 0 };

  const token = await getAccessToken();
  if (!token) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const entry of pending) {
    if (!navigator.onLine) break;

    await markPosSyncing(entry.localId);

    try {
      const result = await postPosCharge(
        entry.eventId,
        {
          productName: entry.productName,
          amountCents: entry.amountCents,
          method: entry.method,
        },
        token,
        entry.localId,
      );
      await markPosSynced(
        entry.localId,
        result.saleId,
        result.gatewayMeta ?? null,
      );
      synced++;
    } catch (err) {
      await markPosError(
        entry.localId,
        err instanceof Error ? err.message : "Sync error",
      );
      failed++;
    }
  }

  return { synced, failed };
}
