"use client";

import { useState } from "react";
import { MessageSquare, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTemplates } from "@/hooks/use-templates";
import { TemplateCard, TemplateCardSkeleton } from "./TemplateCard";
import { TemplateEditorModal } from "./TemplateEditorModal";
import { cn } from "@/lib/utils";
import type { TemplateListItem } from "@/lib/api/templates";
import { useToasts } from "@/hooks/use-toasts";
import { ToastContainer } from "../ui/toast-container";

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