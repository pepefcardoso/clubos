"use client";

import { CreditCard, QrCode } from "lucide-react";
import { ChargeStatusBadge } from "./ChargeStatusBadge";
import { Button } from "@/components/ui/button";
import type { ChargeListItem, ChargesListResult } from "@/lib/api/charges";
import { formatBRL, formatDateISO } from "@/lib/format";

/**
 * Returns true when the charge has resolvable QR/PIX data worth showing in a modal.
 * Mirrors the resolveQrDisplay logic without duplicating the actual resolution.
 */
export function hasQrCode(charge: ChargeListItem): boolean {
    const meta = charge.gatewayMeta;
    if (!meta) return false;
    if (meta["type"] === "static_pix") return true;
    if (typeof meta["qrCodeBase64"] === "string") return true;
    if (typeof meta["qrCodeUrl"] === "string") return true;
    return false;
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div
                                className="h-4 rounded bg-neutral-200 animate-pulse"
                                style={{ width: `${60 + ((i * 3 + j * 7) % 40)}%` }}
                            />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}

function EmptyState() {
    return (
        <tr>
            <td colSpan={7}>
                <div className="py-16 text-center">
                    <CreditCard
                        size={48}
                        className="mx-auto text-neutral-300 mb-3"
                        aria-hidden="true"
                    />
                    <p className="text-neutral-600 font-medium text-[0.9375rem]">
                        Nenhuma cobrança encontrada
                    </p>
                    <p className="text-neutral-400 text-sm mt-1">
                        Tente ajustar os filtros ou gere cobranças para este mês.
                    </p>
                </div>
            </td>
        </tr>
    );
}

interface PaginationProps {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
}

function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
    const totalPages = Math.ceil(total / limit);
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    return (
        <div className="flex items-center justify-between px-1 py-3">
            <p className="text-sm text-neutral-500">
                {total === 0
                    ? "Nenhuma cobrança"
                    : `Mostrando ${from}–${to} de ${total} cobrança${total !== 1 ? "s" : ""}`}
            </p>
            <div className="flex gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    aria-label="Página anterior"
                >
                    ← Anterior
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages}
                    aria-label="Próxima página"
                >
                    Próxima →
                </Button>
            </div>
        </div>
    );
}

const METHOD_LABELS: Record<string, string> = {
    PIX: "Pix",
    CREDIT_CARD: "Cartão de crédito",
    DEBIT_CARD: "Cartão de débito",
    BOLETO: "Boleto",
    CASH: "Dinheiro",
    BANK_TRANSFER: "Transferência",
};

interface ChargesTableProps {
    data: ChargesListResult | undefined;
    isLoading: boolean;
    page: number;
    onPageChange: (p: number) => void;
    onViewQr: (charge: ChargeListItem) => void;
}

export function ChargesTable({
    data,
    isLoading,
    page,
    onPageChange,
    onViewQr,
}: ChargesTableProps) {
    return (
        <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Lista de cobranças">
                    <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200">
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Sócio
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Valor
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Vencimento
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Status
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Método
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Gateway
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Ações
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <SkeletonRows />
                        ) : !data || data.data.length === 0 ? (
                            <EmptyState />
                        ) : (
                            data.data.map((charge) => (
                                <tr
                                    key={charge.id}
                                    className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                                >
                                    <td className="px-4 py-3 font-medium text-neutral-900">
                                        {charge.memberName}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-neutral-900 text-right tabular-nums">
                                        {formatBRL(charge.amountCents)}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-700">
                                        {formatDateISO(charge.dueDate)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <ChargeStatusBadge status={charge.status} />
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600">
                                        {METHOD_LABELS[charge.method] ?? charge.method}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-500 text-xs font-mono">
                                        {charge.gatewayName ?? (
                                            <span className="text-neutral-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end items-center">
                                            {hasQrCode(charge) ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onViewQr(charge)}
                                                    className="flex items-center gap-1.5 text-xs font-medium text-primary-600
                            hover:text-primary-700 hover:bg-primary-50 rounded px-2 py-1 transition-colors"
                                                    aria-label={`Ver QR Code da cobrança de ${charge.memberName}`}
                                                >
                                                    <QrCode size={13} aria-hidden="true" />
                                                    Ver QR
                                                </button>
                                            ) : (
                                                <span className="text-neutral-300 text-xs px-2 py-1">—</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {data && data.total > 0 && (
                <div className="border-t border-neutral-100 px-4">
                    <Pagination
                        page={page}
                        limit={data.limit}
                        total={data.total}
                        onPageChange={onPageChange}
                    />
                </div>
            )}
        </div>
    );
}