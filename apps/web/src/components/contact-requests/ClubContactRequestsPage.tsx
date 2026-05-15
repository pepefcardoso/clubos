"use client";

import { ChevronDown, Inbox, UserCheck } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
    useClubContactRequests,
    useRespondContactRequest,
} from "@/hooks/use-club-contact-requests";
import { ClubContactRequestItem, ContactRequestStatus } from "../../../../../packages/shared-types/src";

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
        label: "Aceita",
        bg: "bg-primary-50",
        text: "text-primary-700",
        dot: "bg-primary-500",
    },
    REJECTED: {
        label: "Rejeitada",
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
                className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", cfg.dot)}
                aria-hidden="true"
            />
            {cfg.label}
        </span>
    );
}

interface RejectModalState {
    open: boolean;
    requestId: string;
    reason: string;
}

const REJECT_MODAL_CLOSED: RejectModalState = {
    open: false,
    requestId: "",
    reason: "",
};

function RejectModal({
    state,
    isPending,
    onChange,
    onConfirm,
    onClose,
}: {
    state: RejectModalState;
    isPending: boolean;
    onChange: (reason: string) => void;
    onConfirm: () => void;
    onClose: () => void;
}) {
    const textareaId = "reject-reason";

    if (!state.open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-modal-title"
        >
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                    <h2
                        id="reject-modal-title"
                        className="text-base font-semibold text-neutral-800"
                    >
                        Rejeitar solicitação
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fechar modal"
                        className="text-neutral-400 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                    >
                        ✕
                    </button>
                </div>

                <p className="text-sm text-neutral-600">
                    Essa ação não pode ser desfeita. O scout será notificado da rejeição.
                </p>

                <div className="flex flex-col gap-1.5">
                    <label
                        htmlFor={textareaId}
                        className="text-sm font-medium text-neutral-700"
                    >
                        Motivo da rejeição{" "}
                        <span className="text-neutral-400 font-normal">(opcional)</span>
                    </label>
                    <textarea
                        id={textareaId}
                        value={state.reason}
                        onChange={(e) => onChange(e.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="Descreva o motivo, se quiser."
                        className="w-full max-w-lg rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none"
                    />
                    <span className="text-xs text-neutral-400 text-right">
                        {state.reason.length}/500
                    </span>
                </div>

                <div className="flex items-center justify-end gap-3 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPending}
                        className="inline-flex items-center justify-center rounded border border-neutral-300 h-9 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isPending}
                        className="inline-flex items-center justify-center rounded bg-danger h-9 px-4 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:opacity-50 transition-opacity"
                    >
                        {isPending ? "Rejeitando…" : "Rejeitar"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ContactCard({
    item,
    onAccept,
    onReject,
    isMutating,
}: {
    item: ClubContactRequestItem;
    onAccept: (id: string) => void;
    onReject: (id: string) => void;
    isMutating: boolean;
}) {
    const createdDate = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(new Date(item.createdAt));

    const respondedDate = item.respondedAt
        ? new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(item.respondedAt))
        : null;

    return (
        <article
            className="rounded-md border border-neutral-200 bg-white p-4 shadow-sm flex flex-col gap-3"
            aria-label={`Solicitação de ${item.scoutName} para atleta ${item.athleteName}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0"
                        aria-hidden="true"
                    >
                        <UserCheck size={18} className="text-primary-700" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-800 truncate">
                            {item.scoutName}
                        </p>
                        <p className="text-xs text-neutral-500 truncate">
                            {item.scoutSpecialization ?? "Scout"} →{" "}
                            <span className="text-neutral-700">{item.athleteName}</span>
                            {item.athletePosition ? ` · ${item.athletePosition}` : ""}
                        </p>
                    </div>
                </div>
                <StatusBadge status={item.status} />
            </div>

            {item.scoutReason && (
                <div className="rounded border border-neutral-100 bg-neutral-50 px-3 py-2">
                    <p className="text-xs text-neutral-500 mb-0.5">
                        Mensagem do scout
                    </p>
                    <p className="text-sm text-neutral-700">{item.scoutReason}</p>
                </div>
            )}

            {item.status === "REJECTED" && item.responseReason && (
                <div className="rounded border border-red-100 bg-red-50 px-3 py-2">
                    <p className="text-xs text-red-500 mb-0.5">Motivo da rejeição</p>
                    <p className="text-sm text-red-700">{item.responseReason}</p>
                </div>
            )}

            <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-400">
                    Enviada em {createdDate}
                    {respondedDate &&
                        ` · ${item.status === "ACCEPTED" ? "Aceita" : "Rejeitada"} em ${respondedDate}`}
                </span>

                {item.status === "PENDING" && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onReject(item.id)}
                            disabled={isMutating}
                            aria-label={`Rejeitar solicitação de ${item.scoutName}`}
                            className="inline-flex items-center justify-center rounded border border-neutral-300 h-9 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 transition-colors"
                        >
                            Rejeitar
                        </button>
                        <button
                            type="button"
                            onClick={() => onAccept(item.id)}
                            disabled={isMutating}
                            aria-label={`Aceitar solicitação de ${item.scoutName}`}
                            className="inline-flex items-center justify-center rounded bg-primary-500 h-9 px-4 text-sm font-semibold text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 transition-colors"
                        >
                            {isMutating ? "Salvando…" : "Aceitar"}
                        </button>
                    </div>
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
            emptySubtext: "Novas solicitações de scouts aparecerão aqui.",
        },
        {
            key: "ACCEPTED",
            heading: "Aceitas",
            emptyText: "Nenhuma solicitação aceita",
            emptySubtext: "Solicitações aprovadas ficarão registradas aqui.",
        },
        {
            key: "REJECTED",
            heading: "Rejeitadas",
            emptyText: "Nenhuma solicitação rejeitada",
            emptySubtext: "Solicitações recusadas ficarão registradas aqui.",
        },
    ];

function InboxSection({
    meta,
    items,
    onAccept,
    onReject,
    isMutating,
}: {
    meta: (typeof SECTION_META)[number];
    items: ClubContactRequestItem[];
    onAccept: (id: string) => void;
    onReject: (id: string) => void;
    isMutating: boolean;
}) {
    const headingId = `club-contact-section-${meta.key.toLowerCase()}`;
    const [open, setOpen] = useState(meta.key === "PENDING");

    return (
        <section aria-labelledby={headingId}>
            <button
                type="button"
                className="w-full flex items-center justify-between px-1 py-2"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls={`club-contact-list-${meta.key}`}
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

            <div id={`club-contact-list-${meta.key}`} hidden={!open}>
                {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12">
                        <Inbox size={48} className="text-neutral-300" aria-hidden="true" />
                        <p className="font-medium text-neutral-600">{meta.emptyText}</p>
                        <p className="text-sm text-neutral-500">{meta.emptySubtext}</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 pb-4">
                        {items.map((item) => (
                            <ContactCard
                                key={item.id}
                                item={item}
                                onAccept={onAccept}
                                onReject={onReject}
                                isMutating={isMutating}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

export function ClubContactRequestsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const { data, isLoading, isError } = useClubContactRequests();
    const respond = useRespondContactRequest();
    const [rejectModal, setRejectModal] = useState<RejectModalState>(
        REJECT_MODAL_CLOSED,
    );

    if (user && user.role !== "ADMIN") {
        router.replace("/dashboard");
        return null;
    }

    const handleAccept = (id: string) => {
        respond.mutate({ id, action: "ACCEPT" });
    };

    const handleRejectOpen = (id: string) => {
        setRejectModal({ open: true, requestId: id, reason: "" });
    };

    const handleRejectConfirm = () => {
        respond.mutate(
            {
                id: rejectModal.requestId,
                action: "REJECT",
                reason: rejectModal.reason || undefined,
            },
            { onSettled: () => setRejectModal(REJECT_MODAL_CLOSED) },
        );
    };

    return (
        <>
            <RejectModal
                state={rejectModal}
                isPending={respond.isPending}
                onChange={(reason) => setRejectModal((s) => ({ ...s, reason }))}
                onConfirm={handleRejectConfirm}
                onClose={() => setRejectModal(REJECT_MODAL_CLOSED)}
            />

            <div className="px-6 py-8 max-w-7xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-2xl font-semibold text-neutral-800">
                        Solicitações de Contato
                    </h1>
                    <p className="text-sm text-neutral-500 mt-0.5">
                        Gerencie as solicitações de scouts para seus atletas.
                    </p>
                </div>

                {isLoading && (
                    <div
                        className="flex flex-col gap-6"
                        aria-busy="true"
                        aria-label="Carregando solicitações…"
                    >
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="space-y-3">
                                <div className="h-5 w-32 rounded bg-neutral-100 animate-pulse" />
                                {[...Array(2)].map((_, j) => (
                                    <div
                                        key={j}
                                        className="h-24 rounded-md bg-neutral-100 animate-pulse"
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                )}

                {isError && (
                    <div
                        role="alert"
                        className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                        Não conseguimos carregar as solicitações. Tente novamente.
                    </div>
                )}

                {data && (
                    <div className="flex flex-col gap-2 divide-y divide-neutral-100">
                        {SECTION_META.map((meta) => (
                            <InboxSection
                                key={meta.key}
                                meta={meta}
                                items={
                                    data[meta.key.toLowerCase() as "pending" | "accepted" | "rejected"]
                                }
                                onAccept={handleAccept}
                                onReject={handleRejectOpen}
                                isMutating={respond.isPending}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}