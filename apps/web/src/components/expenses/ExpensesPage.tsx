"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useExpenses, useDeleteExpense } from "@/hooks/use-expenses";
import { ExpensesFilters } from "./ExpensesFilters";
import { ExpensesTable } from "./ExpensesTable";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import type { ExpenseResponse, ExpenseCategory } from "@/lib/api/expenses";
import { useToasts } from "@/hooks/use-toasts";
import { ToastContainer } from "../ui/toast-container";

interface DeleteConfirmModalProps {
    expense: ExpenseResponse;
    isDeleting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

function DeleteConfirmModal({ expense, isDeleting, onConfirm, onCancel }: DeleteConfirmModalProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-expense-title"
        >
            <div className="relative w-full max-w-md mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="px-6 py-5">
                    <h2 id="delete-expense-title" className="text-base font-semibold text-neutral-900 mb-2">
                        Excluir despesa?
                    </h2>
                    <p className="text-sm text-neutral-600">
                        Você está prestes a excluir{" "}
                        <span className="font-medium text-neutral-900">
                            &quot;{expense.description}&quot;
                        </span>
                        {" "}no valor de{" "}
                        <span className="font-mono font-semibold">{formatBRL(expense.amountCents)}</span>.
                        Essa ação não pode ser desfeita.
                    </p>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                    <Button variant="secondary" onClick={onCancel} disabled={isDeleting}>
                        Cancelar
                    </Button>
                    <Button variant="danger" onClick={onConfirm} disabled={isDeleting}>
                        {isDeleting ? "Excluindo…" : "Excluir"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function currentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ExpensesPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const [month, setMonth] = useState<string>(currentYearMonth);
    const [category, setCategory] = useState<ExpenseCategory | "">("");
    const [page, setPage] = useState(1);

    const [formTarget, setFormTarget] = useState<ExpenseResponse | "new" | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ExpenseResponse | null>(null);

    const { toasts, pushSuccess, pushError } = useToasts();
    const deleteMutation = useDeleteExpense();

    const handleMonthChange = (v: string) => {
        setMonth(v);
        setPage(1);
    };

    const handleCategoryChange = (v: ExpenseCategory | "") => {
        setCategory(v);
        setPage(1);
    };

    const { data, isLoading } = useExpenses({
        page,
        limit: 20,
        month: month || undefined,
        category: category || undefined,
    });

    const handleDeleteConfirm = async () => {
        if (!pendingDelete) return;
        try {
            await deleteMutation.mutateAsync(pendingDelete.id);
            pushSuccess(`Despesa "${pendingDelete.description}" excluída com sucesso`);
            setPendingDelete(null);
        } catch {
            pushError("Não foi possível excluir a despesa. Tente novamente.");
            setPendingDelete(null);
        }
    };

    return (
        <div className="px-6 py-8 max-w-7xl mx-auto">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Despesas</h1>
                    <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                        Registre e gerencie os custos operacionais do clube.
                    </p>
                </div>

                {isAdmin && (
                    <Button onClick={() => setFormTarget("new")}>
                        <Plus size={16} aria-hidden="true" />
                        Nova despesa
                    </Button>
                )}
            </div>

            <div className="mb-4">
                <ExpensesFilters
                    month={month}
                    category={category}
                    onMonthChange={handleMonthChange}
                    onCategoryChange={handleCategoryChange}
                />
            </div>

            <ExpensesTable
                data={data}
                isLoading={isLoading}
                page={page}
                onPageChange={setPage}
                onEdit={isAdmin ? (expense) => setFormTarget(expense) : undefined}
                onDelete={isAdmin ? (expense) => setPendingDelete(expense) : undefined}
            />

            {formTarget !== null && (
                <ExpenseFormModal
                    key={formTarget === "new" ? "new" : formTarget.id}
                    expense={formTarget === "new" ? null : formTarget}
                    onClose={() => setFormTarget(null)}
                    onSuccess={pushSuccess}
                    onError={pushError}
                />
            )}

            {pendingDelete !== null && (
                <DeleteConfirmModal
                    expense={pendingDelete}
                    isDeleting={deleteMutation.isPending}
                    onConfirm={handleDeleteConfirm}
                    onCancel={() => setPendingDelete(null)}
                />
            )}

            <ToastContainer toasts={toasts} />
        </div>
    );
}