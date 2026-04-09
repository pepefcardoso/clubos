"use client";

import { X, Clock, Info } from "lucide-react";
import { useInjuryProtocol } from "@/hooks/use-injury-protocols";
import { cn } from "@/lib/utils";

const GRADE_BADGE: Record<string, string> = {
    GRADE_1: "bg-primary-50 text-primary-700",
    GRADE_2: "bg-amber-50 text-amber-700",
    GRADE_3: "bg-orange-50 text-orange-700",
    COMPLETE: "bg-red-50 text-red-700",
};

const GRADE_LABEL: Record<string, string> = {
    GRADE_1: "Grau I — Leve",
    GRADE_2: "Grau II — Moderado",
    GRADE_3: "Grau III — Grave",
    COMPLETE: "Ruptura Completa",
};

interface ProtocolDetailDrawerProps {
    protocolId: string;
    onClose: () => void;
}

function Skeleton() {
    return (
        <div className="space-y-4 p-6" aria-hidden="true">
            <div className="h-5 w-2/3 rounded bg-neutral-200 animate-pulse" />
            <div className="flex gap-2">
                <div className="h-6 w-24 rounded-full bg-neutral-200 animate-pulse" />
                <div className="h-6 w-20 rounded-full bg-neutral-200 animate-pulse" />
            </div>
            {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-3">
                    <div className="h-4 w-16 rounded bg-neutral-200 animate-pulse flex-shrink-0" />
                    <div className="h-4 flex-1 rounded bg-neutral-200 animate-pulse" />
                </div>
            ))}
        </div>
    );
}

/**
 * Slide-in drawer showing the full protocol detail with steps timeline.
 * Rendered as a right-anchored panel inside a modal overlay.
 */
export function ProtocolDetailDrawer({
    protocolId,
    onClose,
}: ProtocolDetailDrawerProps) {
    const { data: protocol, isLoading, isError } = useInjuryProtocol(protocolId);

    return (
        <div
            className="fixed inset-0 z-[60] flex justify-end"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes do protocolo"
        >
            <div
                className="absolute inset-0 bg-black/30"
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <h3 className="text-base font-semibold text-neutral-900">
                        Protocolo de Reabilitação
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors rounded p-1"
                        aria-label="Fechar detalhes do protocolo"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {isLoading && <Skeleton />}

                    {isError && (
                        <div className="p-6 text-center">
                            <Info
                                size={32}
                                className="mx-auto text-neutral-300 mb-2"
                                aria-hidden="true"
                            />
                            <p className="text-sm text-neutral-500">
                                Não foi possível carregar os detalhes do protocolo.
                            </p>
                        </div>
                    )}

                    {protocol && (
                        <div className="p-5 space-y-5">
                            <div className="space-y-2">
                                <h4 className="text-sm font-semibold text-neutral-900 leading-snug">
                                    {protocol.name}
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    <span
                                        className={cn(
                                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                                            GRADE_BADGE[protocol.grade] ??
                                            "bg-neutral-100 text-neutral-600",
                                        )}
                                    >
                                        {GRADE_LABEL[protocol.grade] ?? protocol.grade}
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-600">
                                        <Clock size={10} aria-hidden="true" />
                                        {protocol.durationDays} dias
                                    </span>
                                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-500">
                                        {protocol.structure}
                                    </span>
                                </div>
                                {protocol.source && (
                                    <p className="text-xs text-neutral-400">{protocol.source}</p>
                                )}
                            </div>

                            <div>
                                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                                    Protocolo de Retorno
                                </p>
                                <div className="space-y-0">
                                    {protocol.steps.map((step, idx) => (
                                        <div key={idx} className="flex gap-3 group">
                                            <div className="flex flex-col items-center flex-shrink-0 w-16">
                                                <div className="w-2 h-2 rounded-full bg-primary-400 mt-1 flex-shrink-0 z-10" />
                                                {idx < protocol.steps.length - 1 && (
                                                    <div className="w-px flex-1 bg-neutral-200 mt-1" />
                                                )}
                                            </div>
                                            <div
                                                className={cn(
                                                    "pb-4 min-w-0",
                                                    idx === protocol.steps.length - 1 ? "pb-1" : "",
                                                )}
                                            >
                                                <p className="text-xs font-semibold text-primary-600 mb-0.5">
                                                    Dia {step.day}
                                                </p>
                                                <p className="text-xs text-neutral-600 leading-relaxed">
                                                    {step.activity}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}