"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getScansForEvent } from "@/lib/db/field-access.db";
import type { FieldAccessQueueEntry } from "@/lib/db/types";

interface UseFieldAccessLogOptions {
  eventId: string;
  refreshTrigger?: boolean | number;
}

interface UseFieldAccessLogReturn {
  entries: FieldAccessQueueEntry[];
  isLoading: boolean;
  refresh: () => void;
}

export function useFieldAccessLog({
  eventId,
  refreshTrigger,
}: UseFieldAccessLogOptions): UseFieldAccessLogReturn {
  const { user } = useAuth();
  const [entries, setEntries] = useState<FieldAccessQueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;

    const fetchAction = user?.clubId
      ? getScansForEvent(user.clubId, eventId)
      : Promise.resolve([]);

    fetchAction
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.clubId, eventId, tick, refreshTrigger]);

  return { entries, isLoading, refresh };
}
