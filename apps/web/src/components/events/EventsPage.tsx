"use client";

import { useState } from "react";
import { Plus, CalendarX, Pencil, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEvents } from "@/hooks/use-events";
import { Button } from "@/components/ui/button";
import { ToastContainer } from "@/components/ui/toast-container";
import { useToasts } from "@/hooks/use-toasts";
import { formatDateTime, formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type EventResponse, type EventStatus } from "@/lib/api/events";
import { EventStatusBadge } from "./EventStatusBadge";
import { EventFormModal } from "./EventFormModal";
import { CancelEventDialog } from "./CancelEventDialog";

const STATUS_OPTIONS: Array<{ value: EventStatus | ""; label: string }> = [
    { value: "", label: "Todos os status" },
    { value: "SCHEDULED", label: "Agendado" },
    { value: "LIVE", label: "Ao vivo" },
    { value: "COMPLETED", label: "Encerrado" },
    { value: "CANCELLED", label: "Cancelado" },
];

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div
                                className="h-4 rounded bg-neutral-200 animate-pulse"
                                style={{ width: `${55 + ((i * 5 + j * 9) % 35)}%` }}
                            />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}

function EmptyState({ hasFilter, isAdmin, onNew }: { hasFilter: boolean; isAdmin: boolean; onNew: () => void }) {
    return (
        <tr>
            <td colSpan={6}>
                <div className="py-16 text-center">
                    <CalendarX size={48} className="mx-auto text-neutral-300 mb-3" aria-hidden="true" />
                    <p className="text-neutral-600 font-medium text-[0.9375rem]">Nenhum evento encontrado</p>
                    <p className="text-neutral-400 text-sm mt-1 mb-4">
                        {hasFilter
                            ? "Tente filtrar por outro status."
                            : "Crie o primeiro evento para começar a vender ingressos."}
                    </p>
                    {isAdmin && !hasFilter && (
                        <Button onClick={onNew} size="sm">
                            <Plus size={14} aria-hidden="true" />
                            Novo evento
                        </Button>
                    )}
                </div>
            </td>
        </tr>
    );
}

function Pagination({
    page,
    limit,
    total,
    onPageChange,
}: {
    page: number;
    limit: number;
    total: number;
    onPageChange: (p: number) => void;
}) {
    const totalPages = Math.ceil(total / limit);
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    return (
        <div className="flex items-center justify-between px-1 py-3">
            <p className="text-sm text-neutral-500">
                {total === 0
                    ? "Nenhum evento"
                    : `Mostrando ${from}–${to} de ${total} evento${total !== 1 ? "s" : ""}`}
            </p>
            <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Página anterior">
                    ← Anterior
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Próxima página">
                    Próxima →
                </Button>
            </div>
        </div>
    );
}

export function EventsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const [statusFilter, setStatusFilter] = useState<EventStatus | "">("");
    const [page, setPage] = useState(1);

    const { data, isLoading, isError, refetch } = useEvents({
        status: statusFilter || undefined,
        page,
        limit: 20,
    });

    const [formTarget, setFormTarget] = useState<EventResponse | "new" | null>(null);
    const [cancelTarget, setCancelTarget] = useState<EventResponse | null>(null);

    const { toasts, pushSuccess, pushError } = useToasts();

    const handleStatusChange = (value: EventStatus | "") => {
        setStatusFilter(value);
        setPage(1);
    };

    return (
        <div className="px-6 py-8 max-w-7xl mx-auto">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Eventos</h1>
                    <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                        Gerencie os eventos e setores do clube.
                    </p>
                </div>
                {isAdmin && (
                    <Button onClick={() => setFormTarget("new")}>
                        <Plus size={16} aria-hidden="true" />
                        Novo evento
                    </Button>
                )}
            </div>

            <div className="mb-4 flex items-center gap-3">
                <select
                    value={statusFilter}
                    onChange={(e) => handleStatusChange(e.target.value as EventStatus | "")}
                    className="h-9 w-48 rounded border border-neutral-300 bg-white px-3 py-1 text-[0.9375rem] text-neutral-900 transition-colors focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20"
                    aria-label="Filtrar por status"
                >
                    {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>

            {isError && (
                <div role="alert" className="mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm text-red-700">
                        Erro ao carregar eventos. Verifique sua conexão e tente novamente.
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => refetch()}>
                        Tentar novamente
                    </Button>
                </div>
            )}

            <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-label="Lista de eventos">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200">
                                {["Adversário", "Data", "Local", "Setores", "Status"].map((h) => (
                                    <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                        {h}
                                    </th>
                                ))}
                                {isAdmin && (
                                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                        Ações
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <SkeletonRows />
                            ) : !data || data.data.length === 0 ? (
                                <EmptyState
                                    hasFilter={!!statusFilter}
                                    isAdmin={isAdmin}
                                    onNew={() => setFormTarget("new")}
                                />
                            ) : (
                                data.data.map((event) => {
                                    const isCancelled = event.status === "CANCELLED";
                                    const totalCapacity = event.sectors.reduce((s, sec) => s + sec.capacity, 0);
                                    const minPrice = event.sectors.length
                                        ? Math.min(...event.sectors.map((s) => s.priceCents))
                                        : null;

                                    return (
                                        <tr
                                            key={event.id}
                                            className={cn(
                                                "border-b border-neutral-100 hover:bg-neutral-50 transition-colors",
                                                isCancelled && "opacity-60",
                                            )}
                                        >
                                            <td className="px-4 py-3 font-medium text-neutral-900">
                                                {event.opponent}
                                            </td>
                                            <td className="px-4 py-3 text-neutral-600">
                                                {formatDateTime(event.eventDate)}
                                            </td>
                                            <td className="px-4 py-3 text-neutral-600 max-w-[180px] truncate">
                                                {event.venue}
                                            </td>
                                            <td className="px-4 py-3 text-neutral-600">
                                                <span className="font-mono">{totalCapacity.toLocaleString("pt-BR")}</span>
                                                {" cap."}
                                                {minPrice !== null && (
                                                    <span className="ml-1 text-neutral-400">
                                                        · a partir de{" "}
                                                        <span className="font-mono">{formatBRL(minPrice)}</span>
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <EventStatusBadge status={event.status} />
                                            </td>
                                            {isAdmin && (
                                                <td className="px-4 py-3">
                                                    <div className="flex justify-end items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormTarget(event)}
                                                            className="p-1.5 text-neutral-400 hover:text-primary-600 transition-colors rounded"
                                                            aria-label={`Editar evento ${event.opponent}`}
                                                        >
                                                            <Pencil size={15} aria-hidden="true" />
                                                        </button>
                                                        {!isCancelled && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setCancelTarget(event)}
                                                                className="p-1.5 text-neutral-400 hover:text-danger transition-colors rounded"
                                                                aria-label={`Cancelar evento ${event.opponent}`}
                                                            >
                                                                <XCircle size={15} aria-hidden="true" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {data && data.total > 0 && (
                    <div className="border-t border-neutral-100 px-4">
                        <Pagination page={page} limit={data.limit} total={data.total} onPageChange={setPage} />
                    </div>
                )}
            </div>

            {formTarget !== null && (
                <EventFormModal
                    key={formTarget === "new" ? "new" : formTarget.id}
                    event={formTarget === "new" ? null : formTarget}
                    onClose={() => setFormTarget(null)}
                    onSuccess={pushSuccess}
                    onError={pushError}
                />
            )}

            {cancelTarget !== null && (
                <CancelEventDialog
                    event={cancelTarget}
                    onClose={() => setCancelTarget(null)}
                    onSuccess={pushSuccess}
                    onError={pushError}
                />
            )}

            <ToastContainer toasts={toasts} />
        </div>
    );
}