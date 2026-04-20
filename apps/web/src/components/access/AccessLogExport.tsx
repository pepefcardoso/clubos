"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv, downloadCsv } from "@/lib/csv-export";
import type { FieldAccessQueueEntry } from "@/lib/db/types";

interface AccessLogExportProps {
    entries: FieldAccessQueueEntry[];
    eventId: string;
}

/**
 * Triggers a client-side CSV download of the scan log for the current event.
 * Reuses the existing `toCsv` / `downloadCsv` utilities from lib/csv-export.ts,
 * including formula-injection protection and the UTF-8 BOM for Excel pt-BR.
 *
 * Disabled when there are no entries to export.
 */
export function AccessLogExport({ entries, eventId }: AccessLogExportProps) {
    const handleExport = () => {
        const rows = entries.map((e) => ({
            horario: new Date(e.scannedAt).toLocaleString("pt-BR"),
            resultado:
                e.localValid === true
                    ? "LIBERADO"
                    : e.localValid === false
                        ? "NEGADO"
                        : "PENDENTE",
            sync: e.syncStatus,
            serverId: e.serverId ?? "—",
            localId: e.localId,
        }));

        const headers = [
            { key: "horario", label: "Horário" },
            { key: "resultado", label: "Resultado" },
            { key: "sync", label: "Sincronização" },
            { key: "serverId", label: "ID Servidor" },
            { key: "localId", label: "ID Local" },
        ];

        const filename = `acessos-${eventId}-${new Date().toISOString().slice(0, 10)}.csv`;
        downloadCsv(toCsv(rows, headers), filename);
    };

    return (
        <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={entries.length === 0}
            aria-label={`Exportar ${entries.length} registros em CSV`}
        >
            <Download size={14} aria-hidden />
            Exportar CSV
            {entries.length > 0 && (
                <span className="ml-1 text-neutral-400">({entries.length})</span>
            )}
        </Button>
    );
}