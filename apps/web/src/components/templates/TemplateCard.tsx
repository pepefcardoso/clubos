"use client";

import { useState, useEffect } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import { useResetTemplate } from "@/hooks/use-templates";
import type { TemplateListItem } from "@/lib/api/templates";

export const KEY_LABELS: Record<string, string> = {
    charge_reminder_d3: "Lembrete D-3 (3 dias antes)",
    charge_reminder_d0: "Lembrete D-0 (dia do vencimento)",
    overdue_notice: "Aviso de Atraso (D+3)",
};

const KEY_DESCRIPTIONS: Record<string, string> = {
    charge_reminder_d3: "Enviado 3 dias antes do vencimento da cobrança.",
    charge_reminder_d0: "Enviado no próprio dia do vencimento.",
    overdue_notice: "Enviado 3 dias após o vencimento (D+3).",
};

/** Duration (ms) the inline reset confirmation stays visible before auto-reverting. */
const RESET_CONFIRM_TTL = 3000;

interface TemplateCardProps {
    template: TemplateListItem;
    channel: "WHATSAPP" | "EMAIL";
    isAdmin: boolean;
    onEdit: (template: TemplateListItem) => void;
    onResetSuccess: (msg: string) => void;
    onResetError: (msg: string) => void;
}

export function TemplateCard({
    template,
    channel,
    isAdmin,
    onEdit,
    onResetSuccess,
    onResetError,
}: TemplateCardProps) {
    const [confirmingReset, setConfirmingReset] = useState(false);
    const reset = useResetTemplate(channel);

    useEffect(() => {
        if (!confirmingReset) return;
        const timer = setTimeout(() => setConfirmingReset(false), RESET_CONFIRM_TTL);
        return () => clearTimeout(timer);
    }, [confirmingReset]);

    async function handleConfirmReset() {
        setConfirmingReset(false);
        try {
            await reset.mutateAsync(template.key);
            onResetSuccess(
                `Template "${KEY_LABELS[template.key] ?? template.key}" restaurado para o padrão.`,
            );
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : "Não foi possível restaurar o template. Tente novamente.";
            onResetError(message);
        }
    }

    const label = KEY_LABELS[template.key] ?? template.key;
    const description = KEY_DESCRIPTIONS[template.key] ?? "";

    return (
        <div className="rounded-md border border-neutral-200 bg-white p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-neutral-900">{label}</h3>
                        {template.isCustom ? (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary-50 text-primary-700">
                                Personalizado
                            </span>
                        ) : (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-neutral-100 text-neutral-500">
                                Padrão
                            </span>
                        )}
                    </div>
                    {description && (
                        <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
                    )}
                </div>
            </div>

            <p className="text-sm text-neutral-600 line-clamp-3 whitespace-pre-wrap leading-relaxed">
                {template.body}
            </p>

            {isAdmin && (
                <div className="flex items-center gap-2 pt-1 border-t border-neutral-100 mt-auto">
                    <button
                        type="button"
                        onClick={() => onEdit(template)}
                        className="flex items-center gap-1.5 text-xs font-medium text-primary-600
              hover:text-primary-700 hover:bg-primary-50 rounded px-2 py-1 transition-colors"
                        aria-label={`Editar template "${label}"`}
                    >
                        <Pencil size={13} aria-hidden="true" />
                        Editar
                    </button>

                    {template.isCustom && (
                        <>
                            {confirmingReset ? (
                                <div className="flex items-center gap-2 ml-auto">
                                    <span className="text-xs text-neutral-500">Confirmar restauração?</span>
                                    <button
                                        type="button"
                                        onClick={handleConfirmReset}
                                        disabled={reset.isPending}
                                        className="text-xs font-medium text-danger hover:bg-red-50 rounded px-2 py-1 transition-colors disabled:opacity-50"
                                        aria-label="Confirmar restauração do template para o padrão"
                                    >
                                        {reset.isPending ? "Restaurando…" : "Confirmar"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmingReset(false)}
                                        className="text-xs font-medium text-neutral-500 hover:bg-neutral-100 rounded px-2 py-1 transition-colors"
                                        aria-label="Cancelar restauração"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setConfirmingReset(true)}
                                    className="flex items-center gap-1.5 text-xs font-medium text-neutral-500
                    hover:text-danger hover:bg-red-50 rounded px-2 py-1 transition-colors ml-auto"
                                    aria-label={`Restaurar template "${label}" para o padrão`}
                                >
                                    <RotateCcw size={13} aria-hidden="true" />
                                    Restaurar padrão
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export function TemplateCardSkeleton() {
    return (
        <div className="rounded-md border border-neutral-200 bg-white p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <div className="h-4 w-40 rounded bg-neutral-200 animate-pulse" />
                <div className="h-4 w-16 rounded-full bg-neutral-200 animate-pulse" />
            </div>
            <div className="space-y-2">
                <div className="h-3 w-full rounded bg-neutral-200 animate-pulse" />
                <div className="h-3 w-5/6 rounded bg-neutral-200 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-neutral-200 animate-pulse" />
            </div>
            <div className="pt-1 border-t border-neutral-100 flex gap-2">
                <div className="h-6 w-16 rounded bg-neutral-200 animate-pulse" />
            </div>
        </div>
    );
}