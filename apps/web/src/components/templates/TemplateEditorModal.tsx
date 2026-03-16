"use client";

import { useState, useRef, useEffect } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TemplatePreview } from "./TemplatePreview";
import { useUpsertTemplate } from "@/hooks/use-templates";
import type { TemplateListItem } from "@/lib/api/templates";

const KEY_LABELS: Record<string, string> = {
    charge_reminder_d3: "Lembrete D-3 (3 dias antes)",
    charge_reminder_d0: "Lembrete D-0 (dia do vencimento)",
    overdue_notice: "Aviso de Atraso (D+3)",
};

const CHAR_WARN_THRESHOLD = 950;
const CHAR_MAX = 1000;
const CHAR_MIN = 10;

interface TemplateEditorModalProps {
    template: TemplateListItem;
    channel: "WHATSAPP" | "EMAIL";
    onClose: () => void;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
}

export function TemplateEditorModal({
    template,
    channel,
    onClose,
    onSuccess,
    onError,
}: TemplateEditorModalProps) {
    const [body, setBody] = useState(template.body);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [placeholdersOpen, setPlaceholdersOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const upsert = useUpsertTemplate(channel);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    const charCount = body.length;
    const isOverWarn = charCount > CHAR_WARN_THRESHOLD;
    const isOverMax = charCount > CHAR_MAX;

    function handleBodyChange(value: string) {
        setBody(value);
        if (validationError) setValidationError(null);
    }

    async function handleSave() {
        if (charCount < CHAR_MIN) {
            setValidationError(
                `O corpo do template deve ter no mínimo ${CHAR_MIN} caracteres.`,
            );
            textareaRef.current?.focus();
            return;
        }
        if (isOverMax) {
            setValidationError(
                `O corpo do template deve ter no máximo ${CHAR_MAX} caracteres.`,
            );
            textareaRef.current?.focus();
            return;
        }

        try {
            await upsert.mutateAsync({ key: template.key, body });
            onSuccess(`Template "${KEY_LABELS[template.key] ?? template.key}" salvo com sucesso.`);
            onClose();
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : "Não foi possível salvar o template. Tente novamente.";
            onError(message);
        }
    }

    return (
        <>
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="editor-modal-title"
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
                <div className="relative flex flex-col w-full max-w-3xl max-h-[90vh] bg-white rounded-lg shadow-lg overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 flex-shrink-0">
                        <div>
                            <h2
                                id="editor-modal-title"
                                className="text-base font-semibold text-neutral-900"
                            >
                                Editar template
                            </h2>
                            <p className="text-sm text-neutral-500 mt-0.5">
                                {KEY_LABELS[template.key] ?? template.key} —{" "}
                                {channel === "WHATSAPP" ? "WhatsApp" : "E-mail"}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                            aria-label="Fechar editor"
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>

                    <div className="flex flex-1 min-h-0 overflow-hidden">
                        <div className="flex flex-col flex-1 min-w-0 px-6 py-4 border-r border-neutral-100 overflow-y-auto">
                            <Label htmlFor="template-body" className="mb-1.5">
                                Corpo da mensagem <span className="text-danger" aria-hidden="true">*</span>
                            </Label>

                            <textarea
                                id="template-body"
                                ref={textareaRef}
                                value={body}
                                onChange={(e) => handleBodyChange(e.target.value)}
                                rows={10}
                                maxLength={CHAR_MAX + 1}
                                aria-describedby={
                                    validationError
                                        ? "body-error"
                                        : "body-char-count body-placeholder-ref"
                                }
                                aria-invalid={validationError !== null ? "true" : undefined}
                                className="flex w-full rounded border border-neutral-300 bg-white px-3 py-2
                  text-sm text-neutral-900 placeholder:text-neutral-400 leading-relaxed
                  transition-colors resize-y min-h-[160px]
                  focus-visible:outline-none focus-visible:border-primary-500
                  focus-visible:ring-2 focus-visible:ring-primary-500/20
                  aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/20"
                            />

                            <p
                                id="body-char-count"
                                className={`mt-1 text-xs text-right tabular-nums ${isOverMax
                                    ? "text-danger font-semibold"
                                    : isOverWarn
                                        ? "text-warning"
                                        : "text-neutral-400"
                                    }`}
                            >
                                {charCount}/{CHAR_MAX}
                            </p>

                            {validationError && (
                                <p
                                    id="body-error"
                                    role="alert"
                                    className="mt-1 text-sm text-danger"
                                >
                                    {validationError}
                                </p>
                            )}

                            <details
                                open={placeholdersOpen}
                                onToggle={(e) =>
                                    setPlaceholdersOpen((e.target as HTMLDetailsElement).open)
                                }
                                className="mt-4 rounded border border-neutral-200 bg-neutral-50"
                                id="body-placeholder-ref"
                            >
                                <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs font-medium text-neutral-600 select-none">
                                    <span>Variáveis disponíveis</span>
                                    {placeholdersOpen ? (
                                        <ChevronUp size={13} aria-hidden="true" />
                                    ) : (
                                        <ChevronDown size={13} aria-hidden="true" />
                                    )}
                                </summary>
                                <ul className="px-3 pb-3 pt-1 space-y-1.5">
                                    {[
                                        { placeholder: "{nome}", description: "nome do sócio" },
                                        { placeholder: "{valor}", description: 'valor da cobrança (ex: R$ 99,00)' },
                                        { placeholder: "{pix_link}", description: "código Pix copia-e-cola" },
                                        { placeholder: "{vencimento}", description: "data de vencimento (DD/MM/AAAA)" },
                                    ].map(({ placeholder, description }) => (
                                        <li key={placeholder} className="flex items-baseline gap-2 text-xs">
                                            <code className="rounded bg-neutral-200 px-1.5 py-0.5 font-mono text-neutral-700 text-[11px]">
                                                {placeholder}
                                            </code>
                                            <span className="text-neutral-500">{description}</span>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        </div>

                        <div className="flex flex-col w-80 flex-shrink-0 px-6 py-4 overflow-y-auto bg-neutral-50">
                            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
                                Pré-visualização
                            </p>
                            <TemplatePreview body={body} channel={channel} />
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200 flex-shrink-0 bg-white">
                        <Button variant="secondary" onClick={onClose} disabled={upsert.isPending}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={upsert.isPending || isOverMax}
                            aria-busy={upsert.isPending}
                        >
                            {upsert.isPending ? "Salvando…" : "Salvar"}
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}