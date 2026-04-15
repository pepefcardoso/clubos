"use client";

import { useState, useRef } from "react";
import {
    Plus,
    FileText,
    Download,
    AlertTriangle,
    XCircle,
    Shield,
    ExternalLink,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
    useBalanceSheets,
    useUploadBalanceSheet,
} from "@/hooks/use-balance-sheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BalanceSheetsApiError } from "@/lib/api/balance-sheets";
import { cn } from "@/lib/utils";
import { useToasts } from "@/hooks/use-toasts";
import { ToastContainer } from "../ui/toast-container";
import { Spinner } from "../ui/spinner";

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

export interface UploadFormFields {
    title: string;
    period: string;
    file: File | null;
}

export function validateUploadForm(
    form: UploadFormFields,
): Partial<Record<keyof UploadFormFields, string>> {
    const errors: Partial<Record<keyof UploadFormFields, string>> = {};

    if (!form.title.trim() || form.title.trim().length < 2) {
        errors.title = "Título deve ter pelo menos 2 caracteres";
    } else if (form.title.trim().length > 200) {
        errors.title = "Título deve ter no máximo 200 caracteres";
    }

    if (!form.period.trim() || form.period.trim().length < 2) {
        errors.period = "Período deve ter pelo menos 2 caracteres";
    } else if (form.period.trim().length > 100) {
        errors.period = "Período deve ter no máximo 100 caracteres";
    }

    if (!form.file) {
        errors.file = "Selecione um arquivo PDF";
    } else if (
        form.file.type !== "application/pdf" &&
        !form.file.name.toLowerCase().endsWith(".pdf")
    ) {
        errors.file = "Apenas arquivos com extensão .pdf são aceitos";
    } else if (form.file.size > MAX_PDF_SIZE_BYTES) {
        errors.file = "Arquivo excede o limite de 10 MB";
    }

    return errors;
}

interface UploadModalProps {
    onClose: () => void;
    onSuccess: (msg: string) => void;
    onError: (msg: string) => void;
}

function UploadModal({ onClose, onSuccess, onError }: UploadModalProps) {
    const uploadMutation = useUploadBalanceSheet();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState<UploadFormFields>({
        title: "",
        period: "",
        file: null,
    });
    const [errors, setErrors] = useState<
        Partial<Record<keyof UploadFormFields, string>>
    >({});

    const isSubmitting = uploadMutation.isPending;

    const set = <K extends keyof UploadFormFields>(
        k: K,
        v: UploadFormFields[K],
    ) => setForm((p) => ({ ...p, [k]: v }));

    const handleSubmit = async (ev: React.FormEvent) => {
        ev.preventDefault();
        const errs = validateUploadForm(form);
        if (Object.keys(errs).length > 0) {
            setErrors(errs);
            return;
        }
        setErrors({});

        try {
            const sheet = await uploadMutation.mutateAsync({
                file: form.file!,
                title: form.title.trim(),
                period: form.period.trim(),
            });
            onSuccess(
                `Balanço "${sheet.title}" publicado. Hash: ${sheet.fileHash.slice(0, 16)}…`,
            );
            onClose();
        } catch (err) {
            if (err instanceof BalanceSheetsApiError) {
                onError(err.message);
            } else {
                onError("Não foi possível publicar o balanço. Tente novamente.");
            }
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-modal-title"
            onClick={(e) => {
                if (e.target === e.currentTarget && !isSubmitting) onClose();
            }}
        >
            <div className="w-full max-w-lg mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <h2
                        id="upload-modal-title"
                        className="text-lg font-semibold text-neutral-900"
                    >
                        Publicar Balanço Patrimonial
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
                            <Label htmlFor="bs-title">
                                Título<span className="text-red-500 ml-0.5">*</span>
                            </Label>
                            <Input
                                id="bs-title"
                                value={form.title}
                                maxLength={200}
                                disabled={isSubmitting}
                                placeholder="Ex: Balanço Patrimonial 2024"
                                aria-invalid={!!errors.title}
                                onChange={(e) => set("title", e.target.value)}
                            />
                            {errors.title && (
                                <p className="text-sm text-red-600" role="alert">
                                    {errors.title}
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="bs-period">
                                Período<span className="text-red-500 ml-0.5">*</span>
                            </Label>
                            <Input
                                id="bs-period"
                                value={form.period}
                                maxLength={100}
                                disabled={isSubmitting}
                                placeholder="Ex: 2024 ou 1º Trimestre 2025"
                                aria-invalid={!!errors.period}
                                className="max-w-xs"
                                onChange={(e) => set("period", e.target.value)}
                            />
                            {errors.period && (
                                <p className="text-sm text-red-600" role="alert">
                                    {errors.period}
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="bs-file">
                                Arquivo PDF<span className="text-red-500 ml-0.5">*</span>
                            </Label>
                            <div className="flex items-center gap-3">
                                <input
                                    ref={fileInputRef}
                                    id="bs-file"
                                    type="file"
                                    accept=".pdf,application/pdf"
                                    disabled={isSubmitting}
                                    className="sr-only"
                                    aria-invalid={!!errors.file}
                                    onChange={(e) => {
                                        const f = e.target.files?.[0] ?? null;
                                        set("file", f);
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    disabled={isSubmitting}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    Escolher arquivo
                                </Button>
                                <span
                                    className={cn(
                                        "text-sm truncate max-w-[200px]",
                                        form.file ? "text-neutral-700" : "text-neutral-400",
                                    )}
                                >
                                    {form.file ? form.file.name : "Nenhum arquivo selecionado"}
                                </span>
                            </div>
                            {form.file && !errors.file && (
                                <p className="text-xs text-neutral-500">
                                    {(form.file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            )}
                            {errors.file && (
                                <p className="text-sm text-red-600" role="alert">
                                    {errors.file}
                                </p>
                            )}
                        </div>

                        <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700 flex items-start gap-2">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden />
                            <span>
                                <strong>Atenção:</strong> Uma vez publicado, o balanço não pode
                                ser excluído ou editado (Lei 14.193/2021).
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <Spinner /> Publicando…
                                </span>
                            ) : (
                                "Publicar balanço"
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100">
                    {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                            <div
                                className="h-4 rounded bg-neutral-200 animate-pulse"
                                style={{ width: `${45 + ((i * 9 + j * 13) % 45)}%` }}
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
            <td colSpan={5}>
                <div className="py-16 text-center">
                    <FileText
                        size={48}
                        className="mx-auto text-neutral-300 mb-3"
                        aria-hidden
                    />
                    <p className="text-neutral-600 font-medium text-[0.9375rem]">
                        Nenhum balanço publicado
                    </p>
                    <p className="text-neutral-400 text-sm mt-1">
                        Publique o primeiro balanço patrimonial do clube para cumprir a
                        transparência exigida pela Lei 14.193/2021.
                    </p>
                </div>
            </td>
        </tr>
    );
}

function HashCell({ hash }: { hash: string }) {
    return (
        <span
            title={hash}
            className="font-mono text-xs text-neutral-500 select-all"
        >
            {hash.slice(0, 16)}…
        </span>
    );
}

export function BalanceSheetsPanel() {
    const { user } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const [showUpload, setShowUpload] = useState(false);
    const { toasts, pushSuccess, pushError } = useToasts();

    const { data, isLoading } = useBalanceSheets();

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
                        <Shield size={20} className="text-primary-600" aria-hidden />
                        Balanços Patrimoniais
                    </h2>
                    <p className="text-neutral-500 text-sm mt-0.5">
                        Documentos publicados conforme Lei 14.193/2021 (SAF) — imutáveis
                        após publicação.
                    </p>
                </div>

                {isAdmin && (
                    <Button onClick={() => setShowUpload(true)}>
                        <Plus size={16} aria-hidden />
                        Publicar balanço
                    </Button>
                )}
            </div>

            <div className="flex items-start gap-2.5 rounded-md bg-amber-50 border border-amber-200 px-4 py-3">
                <AlertTriangle
                    size={16}
                    className="text-amber-600 shrink-0 mt-0.5"
                    aria-hidden
                />
                <p className="text-sm text-amber-800">
                    Balanços publicados são{" "}
                    <strong className="font-semibold">imutáveis</strong> conforme Lei
                    14.193/2021. Não é possível excluir ou editar um documento após a
                    publicação.
                </p>
            </div>

            {data && data.total > 0 && (
                <div className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-4 py-2.5">
                    <FileText size={15} className="text-neutral-400" aria-hidden />
                    <span className="text-sm text-neutral-700">
                        <span className="font-semibold text-neutral-900">{data.total}</span>{" "}
                        documento{data.total !== 1 ? "s" : ""} publicado
                        {data.total !== 1 ? "s" : ""}
                    </span>
                </div>
            )}

            <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table
                        className="w-full text-sm"
                        aria-label="Balanços patrimoniais publicados"
                    >
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200">
                                {(
                                    [
                                        { label: "Título", align: "left" },
                                        { label: "Período", align: "left" },
                                        { label: "Publicado em", align: "left" },
                                        { label: "Hash SHA-256", align: "left" },
                                        { label: "Arquivo", align: "right" },
                                    ] as const
                                ).map((col) => (
                                    <th
                                        key={col.label}
                                        scope="col"
                                        className={cn(
                                            "px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wide",
                                            col.align === "right" ? "text-right" : "text-left",
                                        )}
                                    >
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {isLoading ? (
                                <SkeletonRows />
                            ) : !data || data.data.length === 0 ? (
                                <EmptyState />
                            ) : (
                                data.data.map((sheet) => (
                                    <tr
                                        key={sheet.id}
                                        className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                                    >
                                        <td className="px-4 py-3 font-medium text-neutral-900 max-w-[240px] truncate">
                                            {sheet.title}
                                        </td>

                                        <td className="px-4 py-3 text-neutral-700 whitespace-nowrap">
                                            {sheet.period}
                                        </td>

                                        <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">
                                            {new Intl.DateTimeFormat("pt-BR").format(
                                                new Date(sheet.publishedAt),
                                            )}
                                        </td>

                                        <td className="px-4 py-3">
                                            <HashCell hash={sheet.fileHash} />
                                        </td>

                                        <td className="px-4 py-3 text-right">
                                            <a
                                                href={sheet.fileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-800 transition-colors"
                                                aria-label={`Baixar PDF: ${sheet.title}`}
                                            >
                                                <Download size={13} aria-hidden />
                                                Baixar PDF
                                                <ExternalLink size={11} aria-hidden />
                                            </a>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showUpload && (
                <UploadModal
                    onClose={() => setShowUpload(false)}
                    onSuccess={pushSuccess}
                    onError={pushError}
                />
            )}

            <ToastContainer toasts={toasts} />
        </div>
    );
}