"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Mirrors CheckinConfirmedPayload from apps/api/src/lib/sse-bus.ts */
interface CheckinConfirmedPayload {
  ticketId: string;
  eventId: string;
  fanName: string;
  sectorName: string;
  checkedInAt: string;
}

/**
 * Subscribes to the club SSE stream and accumulates per-sector check-in counts
 * for a given event. Only `CHECKIN_CONFIRMED` events matching `eventId` are
 * processed — all others are silently ignored.
 *
 * Counters are in-memory for the current browser session. On component unmount
 * (e.g. event picker change) the EventSource is closed and counters reset to {}.
 *
 * @param eventId - The event to filter on. Pass `null` to disable the SSE connection.
 * @returns Record<sectorName, count> accumulating check-ins since mount.
 */
export function useCheckinSse(eventId: string | null): Record<string, number> {
  const { getAccessToken } = useAuth();
  const [counters, setCounters] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!eventId) return;

    let es: EventSource | null = null;
    let cancelled = false;

    getAccessToken().then((token) => {
      if (!token || cancelled) return;

      const url = `${API_BASE}/api/events?token=${encodeURIComponent(token)}`;
      es = new EventSource(url);

      es.addEventListener("CHECKIN_CONFIRMED", (e: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(e.data) as CheckinConfirmedPayload;
          if (payload.eventId !== eventId) return;
          setCounters((prev) => ({
            ...prev,
            [payload.sectorName]: (prev[payload.sectorName] ?? 0) + 1,
          }));
        } catch {
          // Malformed SSE data — ignore
        }
      });

      es.onerror = () => {
        // EventSource auto-reconnects; no manual handling needed.
      };
    });

    return () => {
      cancelled = true;
      es?.close();
      setCounters({});
    };
  }, [eventId, getAccessToken]);

  return counters;
}
