"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanLine, WifiOff, RefreshCw, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useAccessScanner } from "@/hooks/use-access-scanner";
import { useFieldAccessLog } from "@/hooks/use-field-access-log";
import { QrCameraScanner } from "./QrCameraScanner";
import { ScanResultOverlay } from "./ScanResultOverlay";
import { AccessLogTable } from "./AccessLogTable";
import { AccessLogExport } from "./AccessLogExport";
import { resetErroredScans, resetStuckSyncingScans } from "@/lib/db/field-access.db";
import { flushPendingScans } from "@/lib/sync/field-access-sync";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface AccessScannerPageProps {
    /**
     * The event identifier passed in from the page route.
     * Falls back to 'open' for open-access mode (no specific event context).
     */
    eventId?: string;
}

/**
 * Page-level orchestrator for the QR Code gate scanner.
 *
 * Responsibilities:
 *   1. Owns the scan state and camera lifecycle via `useAccessScanner`.
 *   2. Refreshes the access log after each scan completes.
 *   3. Flushes pending scans on reconnection.
 *   4. Resets stuck `syncing` entries on mount (crash recovery).
 *   5. Provides manual "sync now" for gate staff.
 */
export function AccessScannerPage({ eventId = "open" }: AccessScannerPageProps) {
    const { user, getAccessToken } = useAuth();
    const { isOnline } = useNetworkStatus();

    const prevOnlineRef = useRef(isOnline);

    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    const [logRefreshKey, setLogRefreshKey] = useState(0);
    const bumpLog = useCallback(() => setLogRefreshKey((k) => k + 1), []);

    const { scanState, onTokenDetected, reset: resetScan } = useAccessScanner({ eventId });
    const { entries, isLoading: logLoading } = useFieldAccessLog({
        eventId,
        refreshTrigger: logRefreshKey,
    });

    useEffect(() => {
        if (!user?.clubId) return;
        void resetStuckSyncingScans(user.clubId);
    }, [user?.clubId]);

    const doFlush = useCallback(async () => {
        if (!user?.clubId || isSyncing) return;
        setIsSyncing(true);
        setSyncError(null);
        try {
            await resetErroredScans(user.clubId);
            await flushPendingScans(user.clubId, getAccessToken);
            bumpLog();
        } catch {
            setSyncError("Falha na sincronização. Tente novamente.");
        } finally {
            setIsSyncing(false);
        }
    }, [user?.clubId, getAccessToken, isSyncing, bumpLog]);

    useEffect(() => {
        const wasOffline = !prevOnlineRef.current;
        const isNowOnline = isOnline;
        prevOnlineRef.current = isOnline;

        if (wasOffline && isNowOnline) {
            void doFlush();
        }
    }, [isOnline, doFlush]);

    useEffect(() => {
        if (scanState.phase === "idle") bumpLog();
    }, [scanState.phase, bumpLog]);

    const isScanning = scanState.phase !== "idle";

    const pendingCount = entries.filter(
        (e) => e.syncStatus === "pending" || e.syncStatus === "error",
    ).length;

    return (
        <div className="flex flex-col min-h-dvh bg-neutral-900">
            <header className="flex items-center justify-between px-4 py-3 bg-neutral-800 border-b border-neutral-700 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
                        <ScanLine size={16} className="text-white" aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-white font-bold text-base leading-tight truncate">
                            Portaria
                        </h1>
                        {eventId !== "open" && (
                            <p className="text-neutral-400 text-xs font-mono truncate">
                                {eventId}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {!isOnline && (
                        <span
                            className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold"
                            role="status"
                            aria-live="polite"
                        >
                            <WifiOff size={13} aria-hidden />
                            Offline
                        </span>
                    )}

                    {isOnline && pendingCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={doFlush}
                            disabled={isSyncing}
                            className="text-xs text-primary-300 hover:text-white hover:bg-neutral-700 h-7 px-2"
                            aria-label={`Sincronizar ${pendingCount} scan${pendingCount !== 1 ? "s" : ""} pendente${pendingCount !== 1 ? "s" : ""}`}
                        >
                            {isSyncing ? (
                                <Spinner size={12} />
                            ) : (
                                <RefreshCw size={12} aria-hidden />
                            )}
                            {pendingCount}
                        </Button>
                    )}
                </div>
            </header>

            {syncError && (
                <div
                    role="alert"
                    className="flex items-center gap-2 px-4 py-2 bg-red-900/50 border-b border-red-800 text-red-300 text-xs font-medium flex-shrink-0"
                >
                    <AlertCircle size={13} aria-hidden />
                    {syncError}
                </div>
            )}

            <div className="relative flex-shrink-0 bg-black">
                <QrCameraScanner onDecode={onTokenDetected} paused={isScanning} />
                <ScanResultOverlay state={scanState} onDismiss={resetScan} />
            </div>

            {!isScanning && (
                <div
                    className="bg-neutral-900 flex-shrink-0 py-3 text-center"
                    aria-live="polite"
                >
                    <p className="text-neutral-400 text-sm">
                        Aponte a câmera para o QR Code do ingresso
                    </p>
                </div>
            )}

            <div className="flex-1 bg-neutral-50 rounded-t-2xl mt-1 px-4 pt-4 pb-8 space-y-3 overflow-y-auto">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-neutral-700">
                        Registro de Acessos
                        {entries.length > 0 && (
                            <span className="ml-1.5 text-xs font-normal text-neutral-400">
                                ({entries.length})
                            </span>
                        )}
                    </h2>
                    <AccessLogExport entries={entries} eventId={eventId} />
                </div>

                <AccessLogTable entries={entries} isLoading={logLoading} />
            </div>
        </div>
    );
}