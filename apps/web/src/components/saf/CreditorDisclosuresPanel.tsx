"use client";

import { useState } from "react";
import {
    Plus,
    FileDown,
    CheckCircle,
    XCircle,
    AlertTriangle,
    FileText,
    Shield,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
    useCreditorDisclosures,
    useCreateCreditorDisclosure,
    useUpdateCreditorStatus,
    useExportCreditorPdf,
} from "@/hooks/use-creditor-disclosures";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    STATUS_LABELS,
    STATUS_COLORS,
    CREDITOR_STATUSES,
    CreditorDisclosureApiError,
    type CreditorStatus,
    type CreditorDisclosureItem,
    type CreateCreditorDisclosurePayload,
} from "@/lib/api/creditor-disclosures";

interface Toast {
    id: number;
    type: "success" | "error" | "info";
    message: string;
}

let toastCounter = 0;

function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const push = (type: Toast["type"], message: string) => {
        const id = ++toastCounter;
        setToasts((prev) => [...prev, { id, type, message }]);
        const ttl = type === "success" ? 4000 : type === "info" ? 8000 : 6000;
        setTimeout(
            () => setToasts((prev) => prev.filter((t) => t.id !== id)),
            ttl,
        );
    };

    return {
        toasts,
        pushSuccess: (m: string) => push("success", m),
        pushError: (m: string) => push("error", m),
        pushInfo: (m: string) => push("info", m),
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
            {toasts.map((t) => (
                <div
                    key={t.id}
                    role="status"
                    className={cn(
                        "flex items-start gap-3 min-w-[300px] max-w-sm rounded-md border-l-4 bg-white px-4 py-3 shadow-lg",
                        t.type === "success" && "border-green-500",
                        t.type === "error" && "border-red-500",
                        t.type === "info" && "border-blue-500",
                    )}
                >
                    {t.type === "success" && (
                        <CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" aria-hidden />
                    )}
                    {t.type === "error" && (
                        <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" aria-hidden />
                    )}
                    {t.type === "info" && (
                        <Shield size={16} className="text-blue-500 mt-0.5 shrink-0" aria-hidden />
                    )}
                    <p className="text-sm text-neutral-700 break-all">{t.message}</p>
                </div>
            ))}
        </div>
    );
}

function Spinner({ className }: { className?: string }) {
    return (
        <svg
            className={cn("animate-spin h-4 w-4", className)}
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden
        >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    );
}

function StatusBadge({ status }: { status: CreditorStatus }) {
    const c = STATUS_COLORS[status];
    return (
        <span
            className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
                c.bg,
                c.text,
                c.border,
            )}
        >
            {STATUS_LABELS[status]}
        </span>
    );
}

interface CreateModalProps {
    onClose: () => void;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
}

interface CreateForm {
    creditorName: string;
    description: string;
    amountStr: string;
    dueDate: string;
}

function CreateModal({ onClose, onSuccess, onError }: CreateModalProps) {
    const createMutation = useCreateCreditorDisclosure();
    const [form, setForm] = useState<CreateForm>({
        creditorName: "",
        description: "",
        amountStr: "",
        dueDate: new Date().toISOString().slice(0, 10),
    });
    const [errors, setErrors] = useState<Partial<Record<keyof CreateForm, string>>>({});
    const isSubmitting = createMutation.isPending;

    const set = <K extends keyof CreateForm>(k: K, v: CreateForm[K]) =>
        setForm((p) => ({ ...p, [k]: v }));

    const validate = (): boolean => {
        const e: typeof errors = {};
        if (!form.creditorName.trim() || form.creditorName.trim().length < 2) {
            e.creditorName = "Nome do credor deve ter pelo menos 2 caracteres";
        } else if (form.creditorName.trim().length > 200) {
            e.creditorName = "Nome do credor deve ter no máximo 200 caracteres";
        }
        const cents = Math.round(parseFloat(form.amountStr) * 100);
        if (!form.amountStr.trim() || isNaN(cents) || cents <= 0) {
            e.amountStr = "Informe um valor maior que zero";
        }
        if (!form.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) {
            e.dueDate = "Informe uma data válida";
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (ev: React.FormEvent) => {
        ev.preventDefault();
        if (!validate()) return;

        const amountCents = Math.round(parseFloat(form.amountStr) * 100);
        const payload: CreateCreditorDisclosurePayload = {
            creditorName: form.creditorName.trim(),
            amountCents,
            dueDate: form.dueDate,
            ...(form.description.trim()
                ? { description: form.description.trim() }
                : {}),
        };

        try {
            await createMutation.mutateAsync(payload);
            onSuccess(`Passivo de "${form.creditorName.trim()}" registrado com sucesso.`);
            onClose();
        } catch (err) {
            onError(
                err instanceof CreditorDisclosureApiError
                    ? err.message
                    : "Não foi possível registrar o passivo. Tente novamente.",
            );
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="creditor-modal-title"
            onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
        >
            <div className="w-full max-w-lg mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <h2 id="creditor-modal-title" className="text-lg font-semibold text-neutral-900">
                        Registrar Passivo Trabalhista
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-50"
                        aria-label="Fechar"
                    >
                        <XCircle size={20} aria-hidden />
                    </button>
                </div>

                <form onSubmit={handleSubmit} noValidate>
                    <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div className="space-y-1.5">
                            <Label htmlFor="cd-creditor">
                                Nome do credor<span className="text-red-500 ml-0.5">*</span>
                            </Label>
                            <Input
                                id="cd-creditor"
                                value={form.creditorName}
                                maxLength={200}
                                disabled={isSubmitting}
                                placeholder="Ex: José Ferreira"
                                aria-invalid={!!errors.creditorName}
                                onChange={(e) => set("creditorName", e.target.value)}
                            />
                            {errors.creditorName && (
                                <p className="text-sm text-red-600" role="alert">{errors.creditorName}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="cd-amount">
                                Valor (R$)<span className="text-red-500 ml-0.5">*</span>
                            </Label>
                            <Input
                                id="cd-amount"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={form.amountStr}
                                disabled={isSubmitting}
                                placeholder="0.00"
                                aria-invalid={!!errors.amountStr}
                                className="font-mono max-w-[200px]"
                                onChange={(e) => set("amountStr", e.target.value)}
                            />
                            {errors.amountStr && (
                                <p className="text-sm text-red-600" role="alert">{errors.amountStr}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="cd-due">
                                Data de vencimento<span className="text-red-500 ml-0.5">*</span>
                            </Label>
                            <Input
                                id="cd-due"
                                type="date"
                                value={form.dueDate}
                                disabled={isSubmitting}
                                aria-invalid={!!errors.dueDate}
                                className="max-w-[200px]"
                                onChange={(e) => set("dueDate", e.target.value)}
                            />
                            {errors.dueDate && (
                                <p className="text-sm text-red-600" role="alert">{errors.dueDate}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="cd-desc">Descrição</Label>
                            <textarea
                                id="cd-desc"
                                value={form.description}
                                disabled={isSubmitting}
                                maxLength={500}
                                rows={3}
                                placeholder="Contexto da obrigação (opcional)"
                                className="flex w-full rounded border border-neutral-300 bg-white px-3 py-2
                  text-[0.9375rem] text-neutral-900 placeholder:text-neutral-400 resize-none
                  transition-colors focus-visible:outline-none focus-visible:border-primary-500
                  focus-visible:ring-2 focus-visible:ring-primary-500/20
                  disabled:cursor-not-allowed disabled:bg-neutral-50"
                                onChange={(e) => set("description", e.target.value)}
                            />
                            <p className="text-xs text-neutral-400 text-right">
                                {form.description.length}/500
                            </p>
                        </div>

                        <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                            <strong>Atenção:</strong> Este registro é permanente (Lei 14.193/2021).
                            Não é possível excluir após o cadastro — apenas atualizar o status.
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <Spinner /> Registrando…
                                </span>
                            ) : (
                                "Registrar passivo"
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

interface StatusModalProps {
    disclosure: CreditorDisclosureItem;
    onClose: () => void;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
}

function StatusModal({ disclosure, onClose, onSuccess, onError }: StatusModalProps) {
    const updateMutation = useUpdateCreditorStatus();
    const [selected, setSelected] = useState<"SETTLED" | "DISPUTED">("SETTLED");
    const isUpdating = updateMutation.isPending;

    const handleConfirm = async () => {
        try {
            await updateMutation.mutateAsync({ id: disclosure.id, status: selected });
            onSuccess(
                `Status de "${disclosure.creditorName}" atualizado para ${STATUS_LABELS[selected]}.`,
            );
            onClose();
        } catch (err) {
            onError(
                err instanceof CreditorDisclosureApiError
                    ? err.message
                    : "Não foi possível atualizar o status. Tente novamente.",
            );
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-modal-title"
        >
            <div className="w-full max-w-md mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="px-6 py-5 space-y-4">
                    <h2 id="status-modal-title" className="text-base font-semibold text-neutral-900">
                        Atualizar status do passivo
                    </h2>
                    <p className="text-sm text-neutral-600">
                        <span className="font-medium">{disclosure.creditorName}</span>
                        {" — "}
                        <span className="font-mono">{formatBRL(disclosure.amountCents)}</span>
                    </p>

                    <div className="space-y-2">
                        {(["SETTLED", "DISPUTED"] as const).map((s) => (
                            <label
                                key={s}
                                className={cn(
                                    "flex items-center gap-3 rounded border-2 px-4 py-3 cursor-pointer transition-colors",
                                    selected === s
                                        ? "border-primary-500 bg-primary-50"
                                        : "border-neutral-200 hover:border-neutral-300",
                                )}
                            >
                                <input
                                    type="radio"
                                    name="creditor-status"
                                    value={s}
                                    checked={selected === s}
                                    onChange={() => setSelected(s)}
                                    className="accent-primary-600"
                                />
                                <span className="text-sm font-medium text-neutral-800">
                                    {STATUS_LABELS[s]}
                                </span>
                            </label>
                        ))}
                    </div>

                    <p className="text-xs text-neutral-500">
                        Esta transição é permanente. Uma vez atualizado, o status não pode ser revertido.
                    </p>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                    <Button variant="secondary" onClick={onClose} disabled={isUpdating}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirm} disabled={isUpdating}>
                        {isUpdating ? (
                            <span className="flex items-center gap-2">
                                <Spinner /> Salvando…
                            </span>
                        ) : (
                            "Confirmar"
                        )}
                    </Button>
                </div>
            </div>
        </div>
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
                    ? "Nenhum registro"
                    : `Mostrando ${from}–${to} de ${total} registro${total !== 1 ? "s" : ""}`}
            </p>
            <div className="flex gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    aria-label="Página anterior"
                >
                    ← Anterior
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages}
                    aria-label="Próxima página"
                >
                    Próxima →
                </Button>
            </div>
        </div>
    );
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div
                                className="h-4 rounded bg-neutral-200 animate-pulse"
                                style={{ width: `${50 + ((i * 7 + j * 11) % 40)}%` }}
                            />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}

function EmptyState() {
    return (
        <tr>
            <td colSpan={6}>
                <div className="py-16 text-center">
                    <FileText size={48} className="mx-auto text-neutral-300 mb-3" aria-hidden />
                    <p className="text-neutral-600 font-medium text-[0.9375rem]">
                        Nenhum passivo trabalhista registrado
                    </p>
                    <p className="text-neutral-400 text-sm mt-1">
                        {'Use "Registrar Passivo" para cadastrar obrigações conforme Lei 14.193/2021.'}
                    </p>
                </div>
            </td>
        </tr>
    );
}

function formatDate(iso: string): string {
    const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
    return new Intl.DateTimeFormat("pt-BR").format(new Date(Date.UTC(y, m - 1, d)));
}

export function CreditorDisclosuresPanel() {
    const { user } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const [statusFilter, setStatusFilter] = useState<CreditorStatus | "">("");
    const [page, setPage] = useState(1);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [statusTarget, setStatusTarget] = useState<CreditorDisclosureItem | null>(null);

    const { toasts, pushSuccess, pushError, pushInfo } = useToasts();
    const exportMutation = useExportCreditorPdf();

    const { data, isLoading } = useCreditorDisclosures({
        page,
        limit: 20,
        status: statusFilter || undefined,
    });

    const handleExport = async () => {
        try {
            const { hash, recordCount } = await exportMutation.mutateAsync();
            pushInfo(
                `PDF exportado (${recordCount} registros). ` +
                `SHA-256: ${hash.slice(0, 16)}…`,
            );
        } catch {
            pushError("Não foi possível gerar o PDF. Tente novamente.");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
                        <AlertTriangle size={20} className="text-amber-500" aria-hidden />
                        Passivos Trabalhistas
                    </h2>
                    <p className="text-neutral-500 text-sm mt-0.5">
                        Obrigações trabalhistas conforme Lei 14.193/2021 (SAF).
                    </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                    {isAdmin && (
                        <Button
                            variant="secondary"
                            onClick={handleExport}
                            disabled={exportMutation.isPending}
                        >
                            {exportMutation.isPending ? (
                                <span className="flex items-center gap-2">
                                    <Spinner /> Exportando…
                                </span>
                            ) : (
                                <>
                                    <FileDown size={16} aria-hidden />
                                    Exportar PDF
                                </>
                            )}
                        </Button>
                    )}

                    {isAdmin && (
                        <Button onClick={() => setShowCreateModal(true)}>
                            <Plus size={16} aria-hidden />
                            Registrar Passivo
                        </Button>
                    )}
                </div>
            </div>

            {data && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="rounded-md border border-neutral-200 bg-white px-4 py-3">
                        <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">
                            Total pendente
                        </p>
                        <p className="text-lg font-bold font-mono text-amber-600 tabular-nums">
                            {formatBRL(data.pendingTotalCents)}
                        </p>
                    </div>
                    <div className="rounded-md border border-neutral-200 bg-white px-4 py-3">
                        <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">
                            Total de registros
                        </p>
                        <p className="text-lg font-bold text-neutral-900">{data.total}</p>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-3">
                <label htmlFor="cd-status-filter" className="text-sm text-neutral-600 shrink-0">
                    Filtrar por status:
                </label>
                <select
                    id="cd-status-filter"
                    value={statusFilter}
                    onChange={(e) => {
                        setStatusFilter(e.target.value as CreditorStatus | "");
                        setPage(1);
                    }}
                    className="h-9 rounded border border-neutral-300 bg-white px-3
            text-sm text-neutral-900 focus-visible:outline-none
            focus-visible:border-primary-500 focus-visible:ring-2
            focus-visible:ring-primary-500/20"
                >
                    <option value="">Todos</option>
                    {CREDITOR_STATUSES.map((s) => (
                        <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                        </option>
                    ))}
                </select>
            </div>

            <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-label="Lista de passivos trabalhistas">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200">
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                    Credor
                                </th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                    Descrição
                                </th>
                                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                    Valor
                                </th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                    Vencimento
                                </th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">
                                    Status
                                </th>
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
                                <EmptyState />
                            ) : (
                                data.data.map((item) => (
                                    <tr
                                        key={item.id}
                                        className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                                        title={item.description ?? undefined}
                                    >
                                        <td className="px-4 py-3 font-medium text-neutral-900">
                                            {item.creditorName}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-500 max-w-[200px] truncate">
                                            {item.description ?? "—"}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-semibold text-neutral-900 tabular-nums">
                                            {formatBRL(item.amountCents)}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-700">
                                            {formatDate(item.dueDate)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={item.status} />
                                        </td>
                                        {isAdmin && (
                                            <td className="px-4 py-3 text-right">
                                                {item.status === "PENDING" ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setStatusTarget(item)}
                                                        className="text-xs text-primary-600 hover:text-primary-800 font-medium transition-colors"
                                                    >
                                                        Atualizar status
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-neutral-400">—</span>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {data && data.total > 0 && (
                    <div className="border-t border-neutral-100 px-4">
                        <Pagination
                            page={page}
                            limit={data.limit}
                            total={data.total}
                            onPageChange={setPage}
                        />
                    </div>
                )}
            </div>

            {showCreateModal && (
                <CreateModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={pushSuccess}
                    onError={pushError}
                />
            )}

            {statusTarget !== null && (
                <StatusModal
                    disclosure={statusTarget}
                    onClose={() => setStatusTarget(null)}
                    onSuccess={pushSuccess}
                    onError={pushError}
                />
            )}

            <ToastContainer toasts={toasts} />
        </div>
    );
}