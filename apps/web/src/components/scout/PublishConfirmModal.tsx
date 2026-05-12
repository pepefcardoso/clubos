"use client";

import { X } from "lucide-react";
import type { ShowcaseTier } from "../../../../../packages/shared-types/src/index.js";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface PublishConfirmModalProps {
    athleteName: string;
    tier: ShowcaseTier;
    isRePublish: boolean;
    isPending: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

const TIER_LABEL: Record<ShowcaseTier, string> = {
    FREE: "Free",
    PREMIUM: "Premium",
};

export function PublishConfirmModal({
    athleteName,
    tier,
    isRePublish,
    isPending,
    onConfirm,
    onClose,
}: PublishConfirmModalProps) {
    const title = isRePublish ? "Reeditar showcase" : "Publicar showcase";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-modal-title"
        >
            <div className="bg-white rounded-lg shadow-lg w-full max-w-md mx-4">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <h2
                        id="publish-modal-title"
                        className="text-base font-semibold text-neutral-900"
                    >
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPending}
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 transition-colors rounded disabled:opacity-50"
                        aria-label="Fechar modal"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-3">
                    <p className="text-sm text-neutral-700">
                        Você está prestes a{" "}
                        {isRePublish ? "reeditar" : "publicar"} o showcase de{" "}
                        <strong>{athleteName}</strong> no tier{" "}
                        <strong>{TIER_LABEL[tier]}</strong>.
                    </p>

                    {tier === "PREMIUM" && (
                        <p className="text-sm text-neutral-500">
                            Scouts poderão ver ACWR, avaliações técnicas e vídeos do
                            atleta.
                        </p>
                    )}

                    {tier === "FREE" && (
                        <p className="text-sm text-neutral-500">
                            O perfil básico com nome, posição e status RTP ficará
                            visível para scouts.
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-neutral-100">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={isPending}
                        type="button"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={isPending}
                        type="button"
                        aria-label={`Confirmar ${isRePublish ? "reedição" : "publicação"} do showcase`}
                    >
                        {isPending ? (
                            <>
                                <Spinner size={14} />
                                Publicando…
                            </>
                        ) : (
                            "Publicar"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}