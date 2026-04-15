"use client";

import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeletePlan } from "@/hooks/use-plans";
import { ApiError, type PlanResponse } from "@/lib/api/plans";
import { Spinner } from "../ui/spinner";

interface DeletePlanDialogProps {
    plan: PlanResponse;
    onClose: () => void;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}

export function DeletePlanDialog({
    plan,
    onClose,
    onSuccess,
    onError,
}: DeletePlanDialogProps) {
    const deleteMutation = useDeletePlan();
    const isDeleting = deleteMutation.isPending;

    const handleConfirm = async () => {
        try {
            await deleteMutation.mutateAsync(plan.id);
            onSuccess(`Plano "${plan.name}" desativado com sucesso`);
            onClose();
        } catch (err) {
            onClose();
            if (err instanceof ApiError && err.status === 409) {
                onError(
                    "Não é possível excluir um plano com sócios ativos vinculados. Remova ou migre os sócios antes de excluir.",
                );
            } else {
                onError("Não foi possível excluir o plano. Tente novamente.");
            }
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
        >
            <div className="relative w-full max-w-md mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <div className="flex items-center gap-2">
                        <AlertTriangle
                            size={18}
                            className="text-danger flex-shrink-0"
                            aria-hidden="true"
                        />
                        <h2
                            id="delete-dialog-title"
                            className="text-base font-semibold text-neutral-900"
                        >
                            Excluir plano
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isDeleting}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-50"
                        aria-label="Fechar"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                <div className="px-6 py-5">
                    <p
                        id="delete-dialog-description"
                        className="text-[0.9375rem] text-neutral-700"
                    >
                        Excluir{" "}
                        <strong className="font-semibold text-neutral-900">
                            {plan.name}
                        </strong>
                        ? O plano será desativado e não ficará mais disponível para novos
                        sócios. Esta ação não pode ser desfeita.
                    </p>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onClose}
                        disabled={isDeleting}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        variant="danger"
                        onClick={handleConfirm}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <span className="flex items-center gap-2">
                                <Spinner />
                                Excluindo…
                            </span>
                        ) : (
                            "Excluir plano"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}