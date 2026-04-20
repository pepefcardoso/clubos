"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { createLocalScan } from "@/lib/db/field-access.db";
import { validateAccess } from "@/lib/api/field-access";
import type { FieldAccessQueueEntry } from "@/lib/db/types";

/**
 * Discriminated union representing every phase of the scan lifecycle.
 *
 *   idle       → camera is active, awaiting a QR code
 *   detecting  → (reserved for future BarcodeDetector async path)
 *   processing → token decoded, server request in-flight
 *   result     → server responded; showing green or red overlay
 *   queued     → offline; scan persisted to Dexie, showing amber overlay
 *   error      → unexpected error (e.g. auth failure)
 */
export type ScanState =
  | { phase: "idle" }
  | { phase: "detecting" }
  | { phase: "processing"; token: string }
  | {
      phase: "result";
      valid: boolean;
      reason?: string;
      entry: FieldAccessQueueEntry;
    }
  | { phase: "queued"; entry: FieldAccessQueueEntry }
  | { phase: "error"; message: string };

interface UseScannerOptions {
  eventId: string;
  /**
   * How long (ms) to display the result overlay before returning to idle.
   * Default: 2500 ms — long enough for gate staff to read the result.
   */
  resultDisplayMs?: number;
  /**
   * Window (ms) within which the same raw token is suppressed to prevent
   * duplicate scan submissions from a held QR code.
   * Default: 4000 ms.
   */
  dedupeWindowMs?: number;
}

/**
 * Manages the entire QR Code scan lifecycle for a single scanner session.
 *
 * Responsibilities:
 *   1. Deduplicate repeated scans of the same token within a time window.
 *   2. Prevent concurrent scan submissions (one at a time).
 *   3. Persist every scan to IndexedDB immediately (works offline).
 *   4. When online: POST to the server and surface the authoritative result.
 *   5. When offline: show amber "queued" overlay; sync happens later.
 *   6. Reset state to `idle` after `resultDisplayMs` so scanning resumes.
 *
 * The `onTokenDetected` callback is stable across renders — safe to pass
 * directly to `QrCameraScanner` without a wrapper.
 */
export function useAccessScanner({
  eventId,
  resultDisplayMs = 2500,
  dedupeWindowMs = 4000,
}: UseScannerOptions) {
  const { getAccessToken, user } = useAuth();
  const { isOnline } = useNetworkStatus();

  const [scanState, setScanState] = useState<ScanState>({ phase: "idle" });

  const lastTokenRef = useRef<{ token: string; ts: number } | null>(null);
  const processingRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setScanState({ phase: "idle" });
      processingRef.current = false;
      resetTimerRef.current = null;
    }, resultDisplayMs);
  }, [resultDisplayMs]);

  /**
   * Called by QrCameraScanner with the raw decoded token string.
   * Handles the full flow: dedupe → persist → (online: POST) → show result.
   */
  const onTokenDetected = useCallback(
    async (rawToken: string) => {
      const now = Date.now();

      if (
        lastTokenRef.current?.token === rawToken &&
        now - lastTokenRef.current.ts < dedupeWindowMs
      ) {
        return;
      }

      if (processingRef.current) return;

      processingRef.current = true;
      lastTokenRef.current = { token: rawToken, ts: now };
      setScanState({ phase: "processing", token: rawToken });

      const scannedAt = new Date(now).toISOString();
      const clubId = user?.clubId ?? "";

      const looksStructurallyValid = rawToken.split(".").length === 3;
      const localValid = looksStructurallyValid;

      let entry: FieldAccessQueueEntry;
      try {
        entry = await createLocalScan({
          clubId,
          eventId,
          token: rawToken,
          scannedAt,
          localValid,
        });
      } catch {
        setScanState({ phase: "error", message: "Erro ao salvar scan local." });
        scheduleReset();
        return;
      }

      if (!isOnline) {
        setScanState({ phase: "queued", entry });
        scheduleReset();
        return;
      }

      try {
        const token = await getAccessToken();
        if (!token) {
          setScanState({
            phase: "error",
            message: "Sessão expirada. Faça login novamente.",
          });
          scheduleReset();
          return;
        }

        const result = await validateAccess(
          eventId,
          {
            token: rawToken,
            idempotencyKey: entry.localId,
            scannedAt,
          },
          token,
        );

        setScanState({
          phase: "result",
          valid: result.valid,
          reason: result.reason,
          entry,
        });
      } catch {
        setScanState({
          phase: "result",
          valid: false,
          reason: "Erro de conexão. Tente novamente.",
          entry,
        });
      }

      scheduleReset();
    },
    [
      eventId,
      user?.clubId,
      isOnline,
      getAccessToken,
      dedupeWindowMs,
      scheduleReset,
    ],
  );

  /**
   * Manually reset to idle (e.g. if gate staff taps the overlay to dismiss).
   */
  const reset = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    processingRef.current = false;
    setScanState({ phase: "idle" });
  }, []);

  return { scanState, onTokenDetected, reset };
}
