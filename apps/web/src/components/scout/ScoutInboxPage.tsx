"use client";

import { ChevronDown, Inbox, Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useScoutContactRequests } from "@/hooks/use-scout-contact-requests";
import { ContactRequestStatus, ScoutContactRequestItem } from "../../../../../packages/shared-types/src";

const STATUS_CONFIG: Record<
    ContactRequestStatus,
    { label: string; bg: string; text: string; dot: string }
> = {
    PENDING: {
        label: "Pendente",
        bg: "bg-amber-50",
        text: "text-amber-700",
        dot: "bg-amber-400",
    },
    ACCEPTED: {
        label: "Aceito",
        bg: "bg-primary-50",
        text: "text-primary-700",
        dot: "bg-primary-500",
    },
    REJECTED: {
        label: "Rejeitado",
        bg: "bg-red-50",
        text: "text-red-700",
        dot: "bg-danger",
    },
};

function StatusBadge({ status }: { status: ContactRequestStatus }) {
    const cfg = STATUS_CONFIG[status];
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                cfg.bg,
                cfg.text,
            )}
            aria-label={`Status: ${cfg.label}`}
        >
            <span
                className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", cfg.dot)}
                aria-hidden="true"
            />
            {cfg.label}
        </span>
    );
}

function AthleteAvatar({ initials }: { initials: string }) {
    return (
        <div
            className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0"
            aria-hidden="true"
        >
            <span className="text-sm font-bold text-primary-700">{initials}</span>
        </div>
    );
}

function ContactCard({ item }: { item: ScoutContactRequestItem }) {
    const respondedDate = item.respondedAt
        ? new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(item.respondedAt))
        : null;

    const createdDate = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(new Date(item.createdAt));

    return (
        <article
            className="rounded-md border border-neutral-200 bg-white p-4 shadow-sm flex flex-col gap-3"
            aria-label={`Solicitação para atleta ${item.athleteInitials}, clube ${item.clubName}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <AthleteAvatar initials={item.athleteInitials} />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-800 truncate">
                            {item.athleteInitials}
                        </p>
                        <p className="text-xs text-neutral-500 truncate">
                            {item.athletePosition ?? "Posição não definida"} · {item.clubName}
                        </p>
                    </div>
                </div>
                <StatusBadge status={item.status} />
            </div>

            {item.scoutReason && (
                <div className="rounded border border-neutral-100 bg-neutral-50 px-3 py-2">
                    <p className="text-xs text-neutral-500 mb-0.5">Sua mensagem</p>
                    <p className="text-sm text-neutral-700">{item.scoutReason}</p>
                </div>
            )}

            {item.status === "REJECTED" && item.responseReason && (
                <div className="rounded border border-red-100 bg-red-50 px-3 py-2">
                    <p className="text-xs text-red-500 mb-0.5">Motivo da rejeição</p>
                    <p className="text-sm text-red-700">{item.responseReason}</p>
                </div>
            )}

            <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>Enviada em {createdDate}</span>
                {respondedDate && (
                    <span>
                        {item.status === "ACCEPTED" ? "Aceita" : "Rejeitada"} em {respondedDate}
                    </span>
                )}
            </div>
        </article>
    );
}

const SECTION_META: Array<{
    key: ContactRequestStatus;
    heading: string;
    emptyText: string;
    emptySubtext: string;
}> = [
        {
            key: "PENDING",
            heading: "Pendentes",
            emptyText: "Nenhuma solicitação pendente",
            emptySubtext: "Suas novas solicitações aparecerão aqui.",
        },
        {
            key: "ACCEPTED",
            heading: "Aceitas",
            emptyText: "Nenhuma solicitação aceita",
            emptySubtext: "Solicitações aprovadas pelos clubes aparecerão aqui.",
        },
        {
            key: "REJECTED",
            heading: "Rejeitadas",
            emptyText: "Nenhuma solicitação rejeitada",
            emptySubtext: "Solicitações recusadas pelos clubes aparecerão aqui.",
        },
    ];

function InboxSection({
    meta,
    items,
}: {
    meta: (typeof SECTION_META)[number];
    items: ScoutContactRequestItem[];
}) {
    const headingId = `inbox-section-${meta.key.toLowerCase()}`;
    const [open, setOpen] = useState(meta.key === "PENDING");

    return (
        <section aria-labelledby={headingId}>
            <button
                type="button"
                className="w-full flex items-center justify-between px-1 py-2 group"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls={`inbox-list-${meta.key}`}
            >
                <h2
                    id={headingId}
                    className="text-sm font-semibold text-neutral-700 flex items-center gap-2"
                >
                    {meta.heading}
                    <span className="inline-flex items-center justify-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 tabular-nums">
                        {items.length}
                    </span>
                </h2>
                <ChevronDown
                    size={16}
                    className={cn(
                        "text-neutral-400 transition-transform duration-200",
                        open && "rotate-180",
                    )}
                    aria-hidden="true"
                />
            </button>

            <div id={`inbox-list-${meta.key}`} hidden={!open}>
                {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12">
                        <Inbox size={48} className="text-neutral-300" aria-hidden="true" />
                        <p className="font-medium text-neutral-600">{meta.emptyText}</p>
                        <p className="text-sm text-neutral-500">{meta.emptySubtext}</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 pb-4">
                        {items.map((item) => (
                            <ContactCard key={item.id} item={item} />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

export function ScoutInboxPage() {
    const { data, isLoading, isError } = useScoutContactRequests();

    return (
        <div className="px-6 py-8 max-w-7xl mx-auto">
            <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-neutral-800">Inbox</h1>
                    <p className="text-sm text-neutral-500 mt-0.5">
                        Acompanhe suas solicitações de contato com atletas.
                    </p>
                </div>
                <a
                    href="/scout/search"
                    aria-label="Nova solicitação — ir para busca de atletas"
                    className="inline-flex items-center gap-1.5 rounded bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors h-9"
                >
                    <Search size={14} aria-hidden="true" />
                    Nova solicitação
                </a>
            </div>

            {
                isLoading && (
                    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando solicitações…">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="space-y-3">
                                <div className="h-5 w-32 rounded bg-neutral-100 animate-pulse" />
                                {[...Array(2)].map((_, j) => (
                                    <div key={j} className="h-24 rounded-md bg-neutral-100 animate-pulse" />
                                ))}
                            </div>
                        ))}
                    </div>
                )
            }

            {
                isError && (
                    <div
                        role="alert"
                        className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                        Não conseguimos carregar seu inbox. Tente novamente.
                    </div>
                )
            }

            {
                data && (
                    <div className="flex flex-col gap-2 divide-y divide-neutral-100">
                        {SECTION_META.map((meta) => (
                            <InboxSection
                                key={meta.key}
                                meta={meta}
                                items={data[meta.key.toLowerCase() as "pending" | "accepted" | "rejected"]}
                            />
                        ))}
                    </div>
                )
            }
        </div >
    );
}