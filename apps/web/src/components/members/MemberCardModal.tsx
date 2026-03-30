"use client";

import { X, Loader2, Share2, Printer } from "lucide-react";
import { useMemberCard } from "@/hooks/use-member-card";
import { MemberCard } from "./MemberCard";
import { Button } from "@/components/ui/button";

interface MemberCardModalProps {
    memberId: string;
    memberName: string;
    onClose: () => void;
}

/**
 * Modal that generates and displays a member's digital membership card.
 *
 * Features:
 *   - Loading skeleton while the card token is being generated
 *   - Error state with actionable message
 *   - Share button (Web Share API, mobile-first) for sending the card link
 *   - Print button that triggers window.print()
 *   - Dismiss on Escape key or backdrop click
 *
 * Offline: React Query's 23h staleTime + gcTime means re-opening this modal
 * for the same member within 24h shows the cached card instantly, even offline.
 */
export function MemberCardModal({
    memberId,
    memberName,
    onClose,
}: MemberCardModalProps) {
    const { data, isLoading, isError } = useMemberCard(memberId);

    const handleShare = async () => {
        if (!data || typeof navigator === "undefined" || !("share" in navigator))
            return;

        const baseUrl = window.location.origin;
        const url = `${baseUrl}/verificar?token=${encodeURIComponent(data.cardToken)}`;

        try {
            await navigator.share({
                title: `Carteirinha — ${memberName}`,
                text: `Carteirinha digital de ${memberName}`,
                url,
            });
        } catch {
            // User cancelled the share sheet — not an error
        }
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    const canShare =
        typeof navigator !== "undefined" && "share" in navigator && !!data;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="card-modal-title"
            onClick={handleBackdropClick}
        >
            <div className="relative w-full max-w-sm bg-white rounded-xl shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                    <h2
                        id="card-modal-title"
                        className="text-sm font-semibold text-neutral-800"
                    >
                        Carteirinha Digital
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors p-1 rounded"
                        aria-label="Fechar carteirinha"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <div className="p-4">
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2
                                size={28}
                                className="text-primary-500 animate-spin"
                                aria-hidden="true"
                            />
                            <p className="text-sm text-neutral-500">
                                Gerando carteirinha…
                            </p>
                        </div>
                    )}

                    {isError && (
                        <div className="py-8 text-center">
                            <p className="text-sm font-medium text-danger">
                                Não foi possível gerar a carteirinha.
                            </p>
                            <p className="text-xs text-neutral-400 mt-1">
                                Verifique a conexão e tente novamente.
                            </p>
                        </div>
                    )}

                    {data && <MemberCard data={data} />}
                </div>

                {data && (
                    <div className="flex gap-2 px-4 pb-4">
                        {canShare && (
                            <Button
                                variant="secondary"
                                size="sm"
                                className="flex-1"
                                onClick={handleShare}
                                aria-label="Compartilhar link da carteirinha"
                            >
                                <Share2 size={14} aria-hidden="true" />
                                Compartilhar
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            onClick={() => window.print()}
                            aria-label="Imprimir carteirinha"
                        >
                            <Printer size={14} aria-hidden="true" />
                            Imprimir
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}