"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import {
  validateTicketApi,
  TicketAlreadyScannedError,
  InvalidTicketError,
  type ValidateTicketResponse,
} from "@/lib/api/tickets-admin";
import { scannerDb } from "@/lib/db/scanner.db";

export type ScanResultType =
  | "success"
  | "duplicate"
  | "invalid"
  | "queued"
  | "error";

export interface ScanResult {
  type: ScanResultType;
  data?: ValidateTicketResponse;
  message: string;
}

interface QrPayload {
  ticketId: string;
  eventId: string;
  clubId: string;
  t: string;
}

export interface TicketScannerReturn {
  lastResult: ScanResult | null;
  handleScan: (rawQr: string) => Promise<void>;
  pendingCount: number;
}

function parseQrPayload(raw: string): QrPayload | null {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof p["ticketId"] !== "string" ||
      typeof p["eventId"] !== "string" ||
      typeof p["clubId"] !== "string" ||
      typeof p["t"] !== "string"
    ) {
      return null;
    }
    return p as unknown as QrPayload;
  } catch {
    return null;
  }
}

/**
 * Orchestrates QR Code ticket scanning with online/offline support.
 *
 * Online flow:
 *   parse QR → in-memory dedup → POST /api/tickets/:id/validate → result
 *
 * Offline flow:
 *   parse QR → in-memory dedup → Dexie dedup → write to scanQueue with status=pending
 *
 * Reconnect sync:
 *   isOnline transition false→true → flush all pending Dexie entries via API
 *
 * Security [SEC-TEN]:
 *   clubId from JWT user object only; cross-club QR payload rejected client-side
 *   before any API call is made.
 *
 * Result auto-clears after 3 seconds to reset the viewfinder for the next scan.
 */
export function useTicketScanner(): TicketScannerReturn {
  const { getAccessToken, user } = useAuth();
  const { isOnline } = useNetworkStatus();

  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  /** In-memory dedup — clears on component unmount / page refresh */
  const scannedIds = useRef<Set<string>>(new Set());

  const refreshPendingCount = useCallback(async () => {
    const count = await scannerDb.scanQueue
      .where("status")
      .equals("pending")
      .count();
    setPendingCount(count);
  }, []);

  const handleScan = useCallback(
    async (rawQr: string) => {
      const parsed = parseQrPayload(rawQr);

      if (!parsed) {
        setLastResult({
          type: "invalid",
          message: "QR Code inválido ou expirado.",
        });
        return;
      }

      if (parsed.clubId !== user?.clubId) {
        setLastResult({
          type: "invalid",
          message: "Ingresso pertence a outro clube.",
        });
        return;
      }

      if (scannedIds.current.has(parsed.ticketId)) {
        setLastResult({
          type: "duplicate",
          message: "Ingresso já lido nesta sessão.",
        });
        return;
      }

      scannedIds.current.add(parsed.ticketId);

      if (!isOnline) {
        const existing = await scannerDb.scanQueue.get(parsed.ticketId);
        if (existing) {
          setLastResult({
            type: "duplicate",
            message: "Ingresso já na fila offline.",
          });
          return;
        }

        await scannerDb.scanQueue.put({
          ticketId: parsed.ticketId,
          qrPayload: rawQr,
          eventId: parsed.eventId,
          scannedAt: Date.now(),
          status: "pending",
        });

        await refreshPendingCount();

        setLastResult({
          type: "queued",
          message: "Sem conexão — será sincronizado ao reconectar.",
        });
        return;
      }

      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Não autenticado.");

        const result = await validateTicketApi(parsed.ticketId, rawQr, token);

        setLastResult({
          type: "success",
          data: result,
          message: `${result.fanName} — ${result.sectorName}`,
        });
      } catch (err) {
        if (err instanceof TicketAlreadyScannedError) {
          setLastResult({
            type: "duplicate",
            message: "Ingresso já utilizado.",
          });
        } else if (err instanceof InvalidTicketError) {
          setLastResult({ type: "invalid", message: err.message });
        } else {
          scannedIds.current.delete(parsed.ticketId);
          setLastResult({
            type: "error",
            message: "Erro de conexão. Tente novamente.",
          });
        }
      }
    },
    [isOnline, getAccessToken, user?.clubId, refreshPendingCount],
  );

  useEffect(() => {
    if (!isOnline) return;

    void (async () => {
      const pending = await scannerDb.scanQueue
        .where("status")
        .equals("pending")
        .toArray();

      if (pending.length === 0) return;

      const token = await getAccessToken();
      if (!token) return;

      for (const entry of pending) {
        try {
          await validateTicketApi(entry.ticketId, entry.qrPayload, token);
          await scannerDb.scanQueue.update(entry.ticketId, {
            status: "synced",
          });
        } catch (err) {
          const status =
            err instanceof TicketAlreadyScannedError ? "synced" : "error";
          await scannerDb.scanQueue.update(entry.ticketId, {
            status,
            errorMessage:
              err instanceof Error ? err.message : "Erro desconhecido.",
          });
        }
      }

      await refreshPendingCount();
    })();
  }, [isOnline, getAccessToken, refreshPendingCount]);

  useEffect(() => {
    if (!lastResult) return;
    const t = setTimeout(() => setLastResult(null), 3000);
    return () => clearTimeout(t);
  }, [lastResult]);

  useEffect(() => {
    let active = true;
    void scannerDb.scanQueue
      .where("status")
      .equals("pending")
      .count()
      .then((c) => {
        if (active) setPendingCount(c);
      });
    return () => {
      active = false;
    };
  }, []);

  return { lastResult, handleScan, pendingCount };
}
