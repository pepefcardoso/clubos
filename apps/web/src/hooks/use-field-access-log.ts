"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getScansForEvent } from "@/lib/db/field-access.db";
import type { FieldAccessQueueEntry } from "@/lib/db/types";

interface UseFieldAccessLogOptions {
  eventId: string;
  /**
   * When true, the hook re-fetches the log from IndexedDB.
   * Flip this to `true` after a scan completes to keep the table in sync.
   */
  refreshTrigger?: boolean | number;
}

interface UseFieldAccessLogReturn {
  entries: FieldAccessQueueEntry[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Reads the local field-access scan log for a given club + event pair from
 * IndexedDB. Refreshes automatically when `refreshTrigger` changes.
 *
 * Returns entries newest-first, consistent with getScansForEvent ordering.
 */
export function useFieldAccessLog({
  eventId,
  refreshTrigger,
}: UseFieldAccessLogOptions): UseFieldAccessLogReturn {
  const { user } = useAuth();
  const [entries, setEntries] = useState<FieldAccessQueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!user?.clubId) return;
    const rows = await getScansForEvent(user.clubId, eventId);
    if (mountedRef.current) setEntries(rows);
  }, [user?.clubId, eventId]);

  useEffect(() => {
    mountedRef.current = true;
    setIsLoading(true);
    void refresh().finally(() => {
      if (mountedRef.current) setIsLoading(false);
    });
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (refreshTrigger !== undefined) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  return { entries, isLoading, refresh };
}
