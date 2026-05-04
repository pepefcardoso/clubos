"use client";

import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCancelEvent } from "@/hooks/use-events";
import { type EventResponse } from "@/lib/api/events";
import { formatDateTime } from "@/lib/format";

interface CancelEventDialogProps {
    event: EventResponse;
    onClose: () => void;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}

export function CancelEventDialog({ event, onClose, onSuccess, onError }: CancelEventDialogProps) {
    const cancelMutation = useCancelEvent();
    const isCancelling = cancelMutation.isPending;

    const handleConfirm = async () => {
        try {
            await cancelMutation.mutateAsync(event.id);
            onSuccess(`Evento "${event.opponent}" cancelado com sucesso`);
            onClose();
        } catch {
            onClose();
            onError("Não foi possível cancelar o evento. Tente novamente.");
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-event-title"
            aria-describedby="cancel-event-desc"
        >
            <div className="relative w-full max-w-md mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={18} className="text-danger flex-shrink-0" aria-hidden="true" />
                        <h2 id="cancel-event-title" className="text-base font-semibold text-neutral-900">
                            Cancelar evento
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isCancelling}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-50"
                        aria-label="Fechar"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                <div className="px-6 py-5">
                    <p id="cancel-event-desc" className="text-[0.9375rem] text-neutral-700">
                        Cancelar o evento{" "}
                        <strong className="font-semibold text-neutral-900">{event.opponent}</strong>
                        {" "}em{" "}
                        <strong className="font-semibold text-neutral-900">
                            {formatDateTime(event.eventDate)}
                        </strong>
                        ? O status será alterado para <em>Cancelado</em>. Esta ação não pode ser desfeita.
                    </p>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isCancelling}>
                        Voltar
                    </Button>
                    <Button type="button" variant="danger" onClick={handleConfirm} disabled={isCancelling}>
                        {isCancelling ? (
                            <span className="flex items-center gap-2">
                                <Spinner />
                                Cancelando…
                            </span>
                        ) : (
                            "Cancelar evento"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}