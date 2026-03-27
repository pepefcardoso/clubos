"use client";

import { Receipt, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, type ExpenseResponse, type ExpensesListResult } from "@/lib/api/expenses";
import { formatBRL } from "@/lib/format";

function formatDate(iso: string): string {
    // iso is "YYYY-MM-DD" — parse in UTC to avoid timezone day-shift
    const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
    return new Intl.DateTimeFormat("pt-BR").format(new Date(Date.UTC(year, month - 1, day)));
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
                <div className="py-16 text-center">
                    <Receipt size={48} className="mx-auto text-neutral-300 mb-3" aria-hidden="true" />
                    <p className="text-neutral-600 font-medium text-[0.9375rem]">
                        Nenhuma despesa registrada
                    </p>
                    <p className="text-neutral-400 text-sm mt-1">
                        {'Clique em "Nova despesa" para começar a registrar os custos do clube.'}
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
    onPageChange: (p: number) => void;
}

function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
    const totalPages = Math.ceil(total / limit);
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    return (
        <div className="flex items-center justify-between px-1 py-3">
            <p className="text-sm text-neutral-500">
                {total === 0
                    ? "Nenhuma despesa"
                    : `Mostrando ${from}–${to} de ${total} despesa${total !== 1 ? "s" : ""}`}
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

interface ExpensesTableProps {
    data: ExpensesListResult | undefined;
    isLoading: boolean;
    page: number;
    onPageChange: (p: number) => void;
    /** Undefined when user is TREASURER (read-only) */
    onEdit?: (expense: ExpenseResponse) => void;
    onDelete?: (expense: ExpenseResponse) => void;
}

export function ExpensesTable({
    data,
    isLoading,
    page,
    onPageChange,
    onEdit,
    onDelete,
}: ExpensesTableProps) {
    const hasActions = !!onEdit || !!onDelete;

    return (
        <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Lista de despesas">
                    <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200">
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                Descrição
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                Categoria
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                Data
                            </th>
                            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                Valor
                            </th>
                            {hasActions && (
                                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                    Ações
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <SkeletonRows />
                        ) : !data || data.data.length === 0 ? (
                            <EmptyState />
                        ) : (
                            data.data.map((expense) => (
                                <tr
                                    key={expense.id}
                                    className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                                    title={expense.notes ?? undefined}
                                >
                                    <td className="px-4 py-3 font-medium text-neutral-900">
                                        {expense.description}
                                        {expense.notes && (
                                            <p className="text-xs text-neutral-400 font-normal mt-0.5 truncate max-w-xs">
                                                {expense.notes}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600">
                                        {CATEGORY_LABELS[expense.category]}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-700">
                                        {formatDate(expense.date)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-semibold text-neutral-900 tabular-nums">
                                        {formatBRL(expense.amountCents)}
                                    </td>
                                    {hasActions && (
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end items-center gap-1">
                                                {onEdit && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onEdit(expense)}
                                                        className="p-1.5 text-neutral-400 hover:text-primary-600 transition-colors rounded"
                                                        aria-label={`Editar despesa ${expense.description}`}
                                                    >
                                                        <Pencil size={15} aria-hidden="true" />
                                                    </button>
                                                )}
                                                {onDelete && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onDelete(expense)}
                                                        className="p-1.5 text-neutral-400 hover:text-danger transition-colors rounded"
                                                        aria-label={`Excluir despesa ${expense.description}`}
                                                    >
                                                        <Trash2 size={15} aria-hidden="true" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
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