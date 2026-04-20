"use client";

import { CheckCircle, XCircle, Clock, Loader2, WifiOff, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldAccessQueueEntry, FieldAccessSyncStatus } from "@/lib/db/types";

interface AccessLogTableProps {
    entries: FieldAccessQueueEntry[];
    isLoading: boolean;
}

const SYNC_CONFIG: Record<
    FieldAccessSyncStatus,
    { icon: React.ReactNode; label: string; className: string }
> = {
    synced: {
        icon: <CheckCircle size={13} aria-hidden />,
        label: "Sincronizado",
        className: "text-emerald-600",
    },
    pending: {
        icon: <Clock size={13} aria-hidden />,
        label: "Pendente",
        className: "text-amber-500",
    },
    syncing: {
        icon: <Loader2 size={13} className="animate-spin" aria-hidden />,
        label: "Sincronizando",
        className: "text-blue-500",
    },
    error: {
        icon: <WifiOff size={13} aria-hidden />,
        label: "Erro",
        className: "text-red-500",
    },
};

function SyncBadge({ status }: { status: FieldAccessSyncStatus }) {
    const cfg = SYNC_CONFIG[status];
    return (
        <span className={cn("flex items-center gap-1 text-xs font-medium", cfg.className)}>
            {cfg.icon}
            <span className="hidden sm:inline">{cfg.label}</span>
        </span>
    );
}

function ResultBadge({ valid }: { valid: boolean | null }) {
    if (valid === true) {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                <CheckCircle size={11} aria-hidden />
                LIBERADO
            </span>
        );
    }
    if (valid === false) {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                <XCircle size={11} aria-hidden />
                NEGADO
            </span>
        );
    }
    return <span className="text-xs text-neutral-400">—</span>;
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} aria-hidden="true">
                    <td className="px-3 py-3">
                        <div
                            className="h-3 rounded bg-neutral-200 animate-pulse"
                            style={{ width: `${50 + (i * 11) % 30}%`, animationDelay: `${i * 60}ms` }}
                        />
                    </td>
                    <td className="px-3 py-3">
                        <div className="h-5 w-16 rounded-full bg-neutral-200 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
                    </td>
                    <td className="px-3 py-3">
                        <div className="h-3 w-20 rounded bg-neutral-200 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
                    </td>
                </tr>
            ))}
        </>
    );
}

/**
 * Renders the scan history for the current event session.
 * Newest entries appear first (ordering handled in getScansForEvent).
 * Sync status icons update live as background sync completes.
 */
export function AccessLogTable({ entries, isLoading }: AccessLogTableProps) {
    if (!isLoading && entries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <TrendingDown
                    size={40}
                    className="text-neutral-200 mb-3"
                    aria-hidden
                />
                <p className="text-sm font-medium text-neutral-500">
                    Nenhum scan registrado ainda.
                </p>
                <p className="text-xs text-neutral-400 mt-1">
                    Os registros aparecerão aqui após o primeiro QR Code lido.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
            <table className="w-full text-sm" aria-label="Registro de acessos escaneados">
                <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50">
                        <th
                            scope="col"
                            className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide"
                        >
                            Horário
                        </th>
                        <th
                            scope="col"
                            className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide"
                        >
                            Resultado
                        </th>
                        <th
                            scope="col"
                            className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide"
                        >
                            Sync
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {isLoading ? (
                        <SkeletonRows />
                    ) : (
                        entries.map((entry) => (
                            <tr
                                key={entry.localId}
                                className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors"
                            >
                                <td className="px-3 py-2.5 font-mono text-xs text-neutral-700 tabular-nums">
                                    {new Intl.DateTimeFormat("pt-BR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit",
                                    }).format(new Date(entry.scannedAt))}
                                </td>
                                <td className="px-3 py-2.5">
                                    <ResultBadge valid={entry.localValid} />
                                </td>
                                <td className="px-3 py-2.5">
                                    <SyncBadge status={entry.syncStatus} />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}