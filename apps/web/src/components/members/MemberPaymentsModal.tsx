"use client";

import { useState } from "react";
import { X, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemberPayments } from "@/hooks/use-members";
import { formatBRL } from "@/lib/format";
import type { MemberResponse } from "@/lib/api/members";

function formatDate(iso: string): string {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(iso));
}

function formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(iso));
}

const METHOD_LABELS: Record<string, string> = {
    PIX: "Pix",
    CREDIT_CARD: "Cartão de crédito",
    DEBIT_CARD: "Cartão de débito",
    BOLETO: "Boleto",
    CASH: "Dinheiro",
    BANK_TRANSFER: "Transferência",
};

const GATEWAY_LABELS: Record<string, string> = {
    asaas: "Asaas",
    pagarme: "Pagarme",
    stripe: "Stripe",
};

function methodLabel(method: string): string {
    return METHOD_LABELS[method] ?? method;
}

function gatewayLabel(name: string | null): string {
    if (!name) return "Offline";
    return GATEWAY_LABELS[name] ?? name;
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100">
                    {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div
                                className="h-4 rounded bg-neutral-200 animate-pulse"
                                style={{ width: `${55 + ((i * 3 + j * 7) % 40)}%` }}
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
            <td colSpan={5}>
                <div className="py-12 text-center">
                    <Receipt
                        size={40}
                        className="mx-auto text-neutral-300 mb-3"
                        aria-hidden="true"
                    />
                    <p className="text-neutral-600 font-medium text-sm">
                        Nenhum pagamento registrado
                    </p>
                    <p className="text-neutral-400 text-xs mt-1">
                        Os pagamentos confirmados aparecerão aqui.
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
            <p className="text-xs text-neutral-500">
                {total === 0
                    ? "Nenhum pagamento"
                    : `${from}–${to} de ${total} pagamento${total !== 1 ? "s" : ""}`}
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

interface MemberPaymentsModalProps {
    member: MemberResponse;
    onClose: () => void;
}

export function MemberPaymentsModal({
    member,
    onClose,
}: MemberPaymentsModalProps) {
    const [page, setPage] = useState(1);
    const { data, isLoading, isError } = useMemberPayments(member.id, page);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payments-modal-title"
        >
            <div className="relative w-full max-w-3xl mx-4 bg-white rounded-lg shadow-lg overflow-hidden flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 flex-shrink-0">
                    <div>
                        <h2
                            id="payments-modal-title"
                            className="text-lg font-semibold text-neutral-900"
                        >
                            Histórico de pagamentos
                        </h2>
                        <p className="text-sm text-neutral-500 mt-0.5">{member.name}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors"
                        aria-label="Fechar modal"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                {/* Table area — scrollable */}
                <div className="flex-1 overflow-y-auto">
                    {isError ? (
                        <div className="py-12 text-center text-sm text-danger px-6">
                            Não foi possível carregar o histórico. Tente novamente.
                        </div>
                    ) : (
                        <table
                            className="w-full text-sm"
                            aria-label="Histórico de pagamentos"
                        >
                            <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-200 z-10">
                                <tr>
                                    <th
                                        scope="col"
                                        className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                    >
                                        Pago em
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
                                        Valor
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <SkeletonRows />
                                ) : !data || data.data.length === 0 ? (
                                    <EmptyState />
                                ) : (
                                    data.data.map((payment) => {
                                        const isCancelled = payment.cancelledAt !== null;
                                        return (
                                            <tr
                                                key={payment.paymentId}
                                                className={[
                                                    "border-b border-neutral-100 transition-colors",
                                                    isCancelled
                                                        ? "bg-neutral-50 opacity-60"
                                                        : "hover:bg-neutral-50",
                                                ].join(" ")}
                                                title={
                                                    isCancelled && payment.cancelReason
                                                        ? `Cancelado: ${payment.cancelReason}`
                                                        : undefined
                                                }
                                            >
                                                {/* Paid at + optional cancelled badge */}
                                                <td className="px-4 py-3 text-neutral-700">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        {formatDateTime(payment.paidAt)}
                                                        {isCancelled && (
                                                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-500">
                                                                Cancelado
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Due date */}
                                                <td className="px-4 py-3 text-neutral-600">
                                                    {formatDate(payment.charge.dueDate)}
                                                </td>

                                                {/* Payment method — with mismatch hint when charge method differs */}
                                                <td className="px-4 py-3 text-neutral-600">
                                                    {methodLabel(payment.method)}
                                                    {payment.method !== payment.charge.method && (
                                                        <span className="ml-1 text-xs text-neutral-400">
                                                            (cobrado: {methodLabel(payment.charge.method)})
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Gateway */}
                                                <td className="px-4 py-3 text-neutral-600">
                                                    {gatewayLabel(payment.charge.gatewayName)}
                                                </td>

                                                {/* Amount — strikethrough when cancelled */}
                                                <td
                                                    className={[
                                                        "px-4 py-3 text-right font-mono font-semibold",
                                                        isCancelled
                                                            ? "text-neutral-400 line-through"
                                                            : "text-neutral-900",
                                                    ].join(" ")}
                                                >
                                                    {formatBRL(payment.amountCents)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination — only visible when there are results */}
                {data && data.meta.total > 0 && (
                    <div className="border-t border-neutral-100 px-4 flex-shrink-0">
                        <Pagination
                            page={page}
                            limit={data.meta.limit}
                            total={data.meta.total}
                            onPageChange={setPage}
                        />
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-end px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex-shrink-0">
                    <Button variant="secondary" onClick={onClose}>
                        Fechar
                    </Button>
                </div>
            </div>
        </div>
    );
}