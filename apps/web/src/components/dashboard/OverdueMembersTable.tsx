"use client";

import { useState } from "react";
import { MessageCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { useOverdueMembers } from "@/hooks/use-dashboard";
import { useRemindMember } from "@/hooks/use-members";
import type { ApiError } from "@/lib/api/dashboard";

function formatDate(iso: string): string {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(iso));
}

function DaysPastDueBadge({ days }: { days: number }) {
    const urgent = days >= 7;
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                urgent ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700",
            )}
        >
            {days}d em atraso
        </span>
    );
}

function Spinner() {
    return (
        <svg
            className="animate-spin h-3.5 w-3.5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
        </svg>
    );
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100">
                    {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div
                                className="h-4 rounded bg-neutral-200 animate-pulse"
                                style={{ width: `${55 + ((i * 3 + j * 7) % 35)}%` }}
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
                    <AlertTriangle
                        size={40}
                        className="mx-auto text-neutral-300 mb-3"
                        aria-hidden="true"
                    />
                    <p className="text-neutral-600 font-medium text-[0.9375rem]">
                        Nenhum sócio inadimplente
                    </p>
                    <p className="text-neutral-400 text-sm mt-1">
                        Todos os sócios estão com mensalidades em dia.
                    </p>
                </div>
            </td>
        </tr>
    );
}

type RemindStatus = "idle" | "sending" | "sent" | "failed" | "throttled";

interface RowRemindState {
    status: RemindStatus;
    message?: string;
}

const COLUMNS = ["Sócio", "Cobrança (R$)", "Vencimento", "Atraso", "Ação"] as const;

export function OverdueMembersTable() {
    const [page, setPage] = useState(1);
    const [rowStates, setRowStates] = useState<Record<string, RowRemindState>>({});

    const { data, isLoading, isError, refetch } = useOverdueMembers(page, 20);
    const remindMutation = useRemindMember();

    const setRowState = (memberId: string, state: RowRemindState) =>
        setRowStates((prev) => ({ ...prev, [memberId]: state }));

    const handleRemind = async (memberId: string, memberName: string) => {
        setRowState(memberId, { status: "sending" });

        try {
            const result = await remindMutation.mutateAsync(memberId);

            if (result.status === "SENT") {
                setRowState(memberId, {
                    status: "sent",
                    message: `Mensagem enviada para ${memberName}`,
                });
            } else {
                setRowState(memberId, {
                    status: "failed",
                    message: result.failReason ?? "Falha no envio. Tente novamente.",
                });
            }
        } catch (err: unknown) {
            const apiErr = err as ApiError | undefined;
            if (apiErr?.status === 429) {
                setRowState(memberId, {
                    status: "throttled",
                    message: apiErr.message ?? "Mensagem já enviada recentemente.",
                });
            } else {
                setRowState(memberId, {
                    status: "failed",
                    message: "Não foi possível enviar o lembrete.",
                });
            }
        }
    };

    const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

    return (
        <div className="bg-white border border-neutral-200 rounded-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                <div>
                    <h2 className="text-base font-semibold text-neutral-900">
                        Sócios Inadimplentes
                    </h2>
                    {data && data.total > 0 && (
                        <p className="text-sm text-neutral-500 mt-0.5">
                            {data.total} sócio{data.total !== 1 ? "s" : ""} com cobrança em
                            atraso
                        </p>
                    )}
                </div>
                {isError && (
                    <Button variant="ghost" size="sm" onClick={() => refetch()}>
                        Tentar novamente
                    </Button>
                )}
            </div>

            {isError && (
                <div
                    role="alert"
                    className="px-6 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100"
                >
                    Não foi possível carregar os inadimplentes. Verifique sua conexão.
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Sócios inadimplentes">
                    <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200">
                            {COLUMNS.map((col) => (
                                <th
                                    key={col}
                                    scope="col"
                                    className={cn(
                                        "px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide",
                                        col === "Ação" ? "text-right" : "text-left",
                                    )}
                                >
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {isLoading ? (
                            <SkeletonRows />
                        ) : !data || data.data.length === 0 ? (
                            <EmptyState />
                        ) : (
                            data.data.map((row) => {
                                const rs = rowStates[row.memberId];
                                const isSending = rs?.status === "sending";
                                const isSent = rs?.status === "sent";
                                const isThrottled = rs?.status === "throttled";
                                const isFailed = rs?.status === "failed";

                                return (
                                    <tr
                                        key={row.memberId}
                                        className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                                    >
                                        <td className="px-4 py-3 font-medium text-neutral-900">
                                            {row.memberName}
                                        </td>

                                        <td className="px-4 py-3 font-mono text-neutral-700">
                                            {formatBRL(row.amountCents)}
                                        </td>

                                        <td className="px-4 py-3 text-neutral-600">
                                            {formatDate(row.dueDate)}
                                        </td>

                                        <td className="px-4 py-3">
                                            <DaysPastDueBadge days={row.daysPastDue} />
                                        </td>

                                        <td className="px-4 py-3">
                                            <div className="flex flex-col items-end gap-1">
                                                <Button
                                                    size="sm"
                                                    variant={
                                                        isSent
                                                            ? "secondary"
                                                            : isFailed || isThrottled
                                                                ? "danger"
                                                                : "default"
                                                    }
                                                    disabled={isSending || isSent}
                                                    onClick={() =>
                                                        handleRemind(row.memberId, row.memberName)
                                                    }
                                                    aria-label={`Cobrar ${row.memberName} via WhatsApp`}
                                                >
                                                    {isSending ? (
                                                        <span className="flex items-center gap-1.5">
                                                            <Spinner />
                                                            Enviando…
                                                        </span>
                                                    ) : isSent ? (
                                                        "Enviado ✓"
                                                    ) : (
                                                        <span className="flex items-center gap-1.5">
                                                            <MessageCircle size={13} aria-hidden="true" />
                                                            Cobrar agora
                                                        </span>
                                                    )}
                                                </Button>

                                                {rs && rs.status !== "sending" && rs.message && (
                                                    <p
                                                        className={cn(
                                                            "text-xs max-w-[200px] text-right leading-snug",
                                                            isSent ? "text-primary-600" : "text-danger",
                                                        )}
                                                        role="status"
                                                        aria-live="polite"
                                                    >
                                                        {rs.message}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {data && data.total > data.limit && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-neutral-100">
                    <p className="text-sm text-neutral-500">
                        {data.total} inadimplente{data.total !== 1 ? "s" : ""}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                            aria-label="Página anterior"
                        >
                            ← Anterior
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                            aria-label="Próxima página"
                        >
                            Próxima →
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}