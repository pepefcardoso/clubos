"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  DASHBOARD_QUERY_KEY,
  CHARGES_HISTORY_QUERY_KEY,
  OVERDUE_MEMBERS_QUERY_KEY,
} from "@/hooks/use-dashboard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Opens an SSE connection to GET /api/events and invalidates the dashboard
 * React Query cache whenever a PAYMENT_CONFIRMED event is received.
 *
 * Designed to be mounted once at the dashboard layout/page level via the
 * DashboardClient wrapper component.
 *
 * Connection lifecycle:
 *   - Opens on mount after a valid access token is available.
 *   - Native EventSource handles reconnection automatically on error
 *     (browser default: ~3s exponential backoff).
 *   - Closes cleanly on component unmount (tab close, navigation).
 *
 * Auth strategy:
 *   EventSource does not support custom headers, so the access token is
 *   passed as a query parameter: GET /api/events?token=<accessToken>.
 *   The server injects it into the Authorization header before calling
 *   verifyAccessToken. Acceptable because:
 *     - Tokens are short-lived (15 min).
 *     - HTTPS is enforced in production.
 *     - The server strips ?token= from access logs (pino redact config).
 *
 * Token expiry handling:
 *   If the SSE connection outlives the 15-min access token, the server
 *   will close the stream when the heartbeat detects the closed socket.
 *   The browser's EventSource auto-reconnect will call connect() again,
 *   and getAccessToken() transparently refreshes the token via the
 *   httpOnly refresh-token cookie — no user action required.
 *
 * Cache invalidation strategy:
 *   On PAYMENT_CONFIRMED, all three dashboard query keys are invalidated.
 *   React Query will silently background-refetch only the queries that
 *   have active observers (mounted components). Unmounted queries are
 *   simply marked stale and refetched when next mounted.
 */
export function useRealTimeEvents(): void {
  const { getAccessToken, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    async function connect() {
      const token = await getAccessToken();
      if (!token || cancelled) return;

      esRef.current?.close();

      const url = `${API_BASE}/api/events?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;

      es.addEventListener("PAYMENT_CONFIRMED", () => {
        void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
        void queryClient.invalidateQueries({
          queryKey: CHARGES_HISTORY_QUERY_KEY,
        });
        void queryClient.invalidateQueries({
          queryKey: OVERDUE_MEMBERS_QUERY_KEY,
        });
      });

      es.onerror = () => {
        console.warn(
          "[sse] Connection error — browser will retry automatically",
        );
      };
    }

    void connect();

    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [isAuthenticated, getAccessToken, queryClient]);
}
