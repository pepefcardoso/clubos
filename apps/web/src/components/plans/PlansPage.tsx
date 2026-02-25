"use client";

import { useState } from "react";
import { Plus, LayoutList, Pencil, Trash2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { usePlans } from "@/hooks/use-plans";
import { formatBRL, intervalLabel } from "@/lib/format";
import { PlanFormModal } from "./PlanFormModal";
import { DeletePlanDialog } from "./DeletePlanDialog";
import type { PlanResponse } from "@/lib/api/plans";

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
    id: number;
    type: "success" | "error";
    message: string;
}

let toastCounter = 0;

function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const push = (type: Toast["type"], message: string) => {
        const id = ++toastCounter;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, type === "success" ? 3000 : 6000);
    };

    return { toasts, pushSuccess: (msg: string) => push("success", msg), pushError: (msg: string) => push("error", msg) };
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
    if (toasts.length === 0) return null;

    return (
        <div
            aria-live="polite"
            aria-atomic="false"
            className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    role="status"
                    className={cn(
                        "flex items-start gap-3 min-w-[280px] max-w-sm rounded-md border-l-4 bg-white px-4 py-3 shadow-lg",
                        toast.type === "success"
                            ? "border-primary-500"
                            : "border-danger",
                    )}
                >
                    {toast.type === "success" ? (
                        <CheckCircle size={16} className="text-primary-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    ) : (
                        <XCircle size={16} className="text-danger flex-shrink-0 mt-0.5" aria-hidden="true" />
                    )}
                    <p className="text-sm text-neutral-700">{toast.message}</p>
                </div>
            ))}
        </div>
    );
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div
                                className="h-4 rounded bg-neutral-200 animate-pulse"
                                style={{ width: `${55 + ((i * 4 + j * 9) % 35)}%` }}
                            />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}

interface EmptyStateProps {
    isAdmin: boolean;
    onNew: () => void;
}

function EmptyState({ isAdmin, onNew }: EmptyStateProps) {
    return (
        <tr>
            <td colSpan={6}>
                <div className="py-16 text-center">
                    <LayoutList
                        size={48}
                        className="mx-auto text-neutral-300 mb-3"
                        aria-hidden="true"
                    />
                    <p className="text-neutral-600 font-medium text-[0.9375rem]">
                        Nenhum plano cadastrado
                    </p>
                    <p className="text-neutral-400 text-sm mt-1 mb-4">
                        Crie o primeiro plano para começar a gerar cobranças.
                    </p>
                    {isAdmin && (
                        <Button onClick={onNew} size="sm">
                            <Plus size={14} aria-hidden="true" />
                            Novo plano
                        </Button>
                    )}
                </div>
            </td>
        </tr>
    );
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                isActive
                    ? "bg-primary-50 text-primary-700"
                    : "bg-neutral-100 text-neutral-500 line-through",
            )}
        >
            {isActive ? "Ativo" : "Inativo"}
        </span>
    );
}

export function PlansPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const { data: plans, isLoading, isError, refetch } = usePlans();

    const [formTarget, setFormTarget] = useState<PlanResponse | null | "new">(null);
    const [deleteTarget, setDeleteTarget] = useState<PlanResponse | null>(null);

    const { toasts, pushSuccess, pushError } = useToasts();

    const openNew = () => setFormTarget("new");
    const openEdit = (plan: PlanResponse) => setFormTarget(plan);
    const closeForm = () => setFormTarget(null);
    const closeDelete = () => setDeleteTarget(null);

    return (
        <div className="px-6 py-8 max-w-7xl mx-auto">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                        Planos
                    </h1>
                    <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                        Gerencie os planos de associação do clube.
                    </p>
                </div>
                {isAdmin && (
                    <Button onClick={openNew}>
                        <Plus size={16} aria-hidden="true" />
                        Novo plano
                    </Button>
                )}
            </div>

            {isError && (
                <div
                    role="alert"
                    className="mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3"
                >
                    <p className="text-sm text-red-700">
                        Erro ao carregar planos. Verifique sua conexão e tente novamente.
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => refetch()}>
                        Tentar novamente
                    </Button>
                </div>
            )}

            <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-label="Lista de planos">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200">
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    Nome
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    Preço
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    Cobrança
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    Benefícios
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    Status
                                </th>
                                {isAdmin && (
                                    <th
                                        scope="col"
                                        className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                    >
                                        Ações
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <SkeletonRows />
                            ) : !plans || plans.length === 0 ? (
                                <EmptyState isAdmin={isAdmin} onNew={openNew} />
                            ) : (
                                plans.map((plan) => (
                                    <tr
                                        key={plan.id}
                                        className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                                    >
                                        <td className="px-4 py-3 font-medium text-neutral-900">
                                            {plan.name}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-neutral-700">
                                            {formatBRL(plan.priceCents)}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-600">
                                            {intervalLabel[plan.interval] ?? plan.interval}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-600">
                                            {plan.benefits.length > 0 ? (
                                                `${plan.benefits.length} benefício${plan.benefits.length !== 1 ? "s" : ""}`
                                            ) : (
                                                <span className="text-neutral-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <ActiveBadge isActive={plan.isActive} />
                                        </td>
                                        {isAdmin && (
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(plan)}
                                                        className="p-1.5 text-neutral-400 hover:text-primary-600 transition-colors rounded"
                                                        aria-label={`Editar plano ${plan.name}`}
                                                    >
                                                        <Pencil size={15} aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeleteTarget(plan)}
                                                        className="p-1.5 text-neutral-400 hover:text-danger transition-colors rounded"
                                                        aria-label={`Excluir plano ${plan.name}`}
                                                    >
                                                        <Trash2 size={15} aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {formTarget !== null && (
                <PlanFormModal
                    plan={formTarget === "new" ? null : formTarget}
                    onClose={closeForm}
                    onSuccess={pushSuccess}
                    onError={pushError}
                />
            )}

            {deleteTarget !== null && (
                <DeletePlanDialog
                    plan={deleteTarget}
                    onClose={closeDelete}
                    onSuccess={pushSuccess}
                    onError={pushError}
                />
            )}

            <ToastContainer toasts={toasts} />
        </div>
    );
}