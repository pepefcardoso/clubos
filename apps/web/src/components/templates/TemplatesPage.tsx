"use client";

import { useState } from "react";
import { MessageSquare, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTemplates } from "@/hooks/use-templates";
import { TemplateCard, TemplateCardSkeleton } from "./TemplateCard";
import { TemplateEditorModal } from "./TemplateEditorModal";
import { cn } from "@/lib/utils";
import type { TemplateListItem } from "@/lib/api/templates";

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
        setTimeout(
            () => setToasts((prev) => prev.filter((t) => t.id !== id)),
            type === "success" ? 3000 : 6000,
        );
    };

    return {
        toasts,
        pushSuccess: (msg: string) => push("success", msg),
        pushError: (msg: string) => push("error", msg),
    };
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
                        toast.type === "success" ? "border-primary-500" : "border-danger",
                    )}
                >
                    {toast.type === "success" ? (
                        <CheckCircle
                            size={16}
                            className="text-primary-500 flex-shrink-0 mt-0.5"
                            aria-hidden="true"
                        />
                    ) : (
                        <XCircle
                            size={16}
                            className="text-danger flex-shrink-0 mt-0.5"
                            aria-hidden="true"
                        />
                    )}
                    <p className="text-sm text-neutral-700">{toast.message}</p>
                </div>
            ))}
        </div>
    );
}

type Channel = "WHATSAPP" | "EMAIL";

const CHANNEL_OPTIONS: Array<{ value: Channel; label: string }> = [
    { value: "WHATSAPP", label: "WhatsApp" },
    { value: "EMAIL", label: "E-mail" },
];

interface ChannelTabsProps {
    value: Channel;
    onChange: (v: Channel) => void;
}

function ChannelTabs({ value, onChange }: ChannelTabsProps) {
    return (
        <div
            role="tablist"
            aria-label="Canal de mensagem"
            className="inline-flex rounded-md border border-neutral-300 overflow-hidden"
        >
            {CHANNEL_OPTIONS.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    role="tab"
                    aria-selected={value === opt.value}
                    onClick={() => onChange(opt.value)}
                    className={cn(
                        "px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset",
                        value === opt.value
                            ? "bg-primary-500 text-white"
                            : "bg-white text-neutral-600 hover:bg-neutral-50",
                    )}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

export function TemplatesPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const [channel, setChannel] = useState<Channel>("WHATSAPP");
    const [editTarget, setEditTarget] = useState<TemplateListItem | null>(null);

    const { toasts, pushSuccess, pushError } = useToasts();
    const { data, isLoading, isError } = useTemplates(channel);

    function handleChannelChange(newChannel: Channel) {
        setChannel(newChannel);
        setEditTarget(null);
    }

    return (
        <div className="px-6 py-8 max-w-7xl mx-auto">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                        Mensagens
                    </h1>
                    <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                        Personalize os textos dos lembretes de cobrança enviados aos sócios.
                    </p>
                </div>

                <ChannelTabs value={channel} onChange={handleChannelChange} />
            </div>

            {isError && (
                <div
                    role="alert"
                    className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3"
                >
                    <XCircle size={16} className="text-danger flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-sm text-danger">
                        Não foi possível carregar os templates. Tente recarregar a página.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoading ? (
                    <>
                        <TemplateCardSkeleton />
                        <TemplateCardSkeleton />
                        <TemplateCardSkeleton />
                    </>
                ) : data && data.length > 0 ? (
                    data.map((template) => (
                        <TemplateCard
                            key={template.key}
                            template={template}
                            channel={channel}
                            isAdmin={isAdmin}
                            onEdit={setEditTarget}
                            onResetSuccess={pushSuccess}
                            onResetError={pushError}
                        />
                    ))
                ) : !isError ? (
                    <div className="col-span-full py-16 text-center">
                        <MessageSquare
                            size={48}
                            className="mx-auto text-neutral-300 mb-3"
                            aria-hidden="true"
                        />
                        <p className="text-neutral-600 font-medium text-[0.9375rem]">
                            Nenhum template disponível
                        </p>
                        <p className="text-neutral-400 text-sm mt-1">
                            Os templates de mensagens não foram encontrados.
                        </p>
                    </div>
                ) : null}
            </div>

            {!isAdmin && !isLoading && (
                <p className="mt-6 text-sm text-neutral-400 text-center">
                    Somente administradores podem editar os templates de mensagem.
                </p>
            )}

            {editTarget !== null && (
                <TemplateEditorModal
                    key={editTarget.key}
                    template={editTarget}
                    channel={channel}
                    onClose={() => setEditTarget(null)}
                    onSuccess={pushSuccess}
                    onError={pushError}
                />
            )}

            <ToastContainer toasts={toasts} />
        </div>
    );
}