"use client";

import { useState, useRef, useEffect } from "react";
import {
    X,
    Upload,
    FileText,
    CheckCircle,
    AlertCircle,
    ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useImportMembers } from "@/hooks/use-members";
import { CsvTemplateDownload } from "./CsvTemplateDownload";
import type {
    ImportRowError,
    ImportSuccessResponse,
} from "@/lib/api/members-import";
import { ApiError } from "@/lib/api/members";
import { Spinner } from "../ui/spinner";

type ModalState =
    | { phase: "idle" }
    | { phase: "file_selected"; file: File }
    | { phase: "uploading"; file: File }
    | { phase: "result"; result: ImportSuccessResponse; file: File }
    | { phase: "hard_error"; message: string };

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function validateFile(file: File): string | null {
    if (!file.name.toLowerCase().endsWith(".csv")) {
        return "O arquivo deve ter extensão .csv";
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
        return "O arquivo excede o limite de 5 MB";
    }
    return null;
}

interface DropzoneProps {
    state: ModalState;
    isDragging: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
    onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onReset: () => void;
}

function Dropzone({
    state,
    isDragging,
    fileInputRef,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileInput,
    onReset,
}: DropzoneProps) {
    const hasFile = state.phase === "file_selected";
    const hasError = state.phase === "hard_error";
    const isIdle = state.phase === "idle";

    const borderClass = hasError
        ? "border-danger bg-red-50"
        : isDragging
            ? "border-primary-400 bg-primary-50 cursor-copy"
            : hasFile
                ? "border-primary-300 bg-primary-50 cursor-default"
                : "border-neutral-300 bg-neutral-50 hover:border-primary-400 hover:bg-primary-50 cursor-pointer";

    return (
        <div>
            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => {
                    if (!hasFile && !hasError) fileInputRef.current?.click();
                }}
                className={[
                    "relative flex flex-col items-center justify-center gap-3",
                    "rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors",
                    borderClass,
                ].join(" ")}
                role={isIdle ? "button" : undefined}
                tabIndex={isIdle ? 0 : undefined}
                aria-label={
                    isIdle
                        ? "Área de upload de CSV. Clique ou arraste o arquivo."
                        : undefined
                }
                onKeyDown={(e) => {
                    if (isIdle && (e.key === "Enter" || e.key === " ")) {
                        fileInputRef.current?.click();
                    }
                }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={onFileInput}
                    aria-hidden="true"
                />

                {hasError && state.phase === "hard_error" && (
                    <>
                        <AlertCircle
                            size={32}
                            className="text-danger"
                            aria-hidden="true"
                        />
                        <div>
                            <p className="text-sm font-medium text-danger">{state.message}</p>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onReset();
                                }}
                                className="mt-1 text-xs text-neutral-500 underline hover:text-neutral-700 transition-colors"
                            >
                                Tentar outro arquivo
                            </button>
                        </div>
                    </>
                )}

                {hasFile && state.phase === "file_selected" && (
                    <>
                        <FileText
                            size={32}
                            className="text-primary-500"
                            aria-hidden="true"
                        />
                        <div>
                            <p className="text-sm font-medium text-neutral-900">
                                {state.file.name}
                            </p>
                            <p className="text-xs text-neutral-500">
                                {(state.file.size / 1024).toFixed(1)} KB
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onReset();
                            }}
                            className="text-xs text-neutral-400 underline hover:text-neutral-600 transition-colors"
                        >
                            Trocar arquivo
                        </button>
                    </>
                )}

                {isIdle && (
                    <>
                        <Upload
                            size={32}
                            className="text-neutral-400"
                            aria-hidden="true"
                        />
                        <div>
                            <p className="text-sm font-medium text-neutral-700">
                                Arraste o arquivo aqui ou{" "}
                                <span className="text-primary-600 underline">
                                    clique para selecionar
                                </span>
                            </p>
                            <p className="text-xs text-neutral-500 mt-1">
                                Apenas .csv · Máximo 5 MB · Até 5.000 linhas
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function UploadingState({ filename }: { filename: string }) {
    return (
        <div className="flex items-center gap-4 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-4">
            <Spinner size={20} />
            <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900">Importando…</p>
                <p className="text-xs text-neutral-500 truncate max-w-xs">{filename}</p>
            </div>
        </div>
    );
}

function ErrorTable({ errors }: { errors: ImportRowError[] }) {
    return (
        <details open className="group">
            <summary className="cursor-pointer list-none text-sm font-medium text-danger flex items-center gap-1.5 select-none">
                <AlertCircle size={14} aria-hidden="true" />
                {errors.length} linha{errors.length !== 1 ? "s" : ""} com erro
                <ChevronDown
                    size={12}
                    className="ml-auto transition-transform group-open:rotate-180"
                    aria-hidden="true"
                />
            </summary>

            <div className="mt-2 rounded-md border border-red-200 overflow-hidden">
                <table
                    className="w-full text-xs"
                    aria-label="Erros de importação por linha"
                >
                    <thead>
                        <tr className="bg-red-50 border-b border-red-200">
                            <th
                                scope="col"
                                className="px-3 py-2 text-left font-medium text-neutral-500 uppercase tracking-wide w-16"
                            >
                                Linha
                            </th>
                            <th
                                scope="col"
                                className="px-3 py-2 text-left font-medium text-neutral-500 uppercase tracking-wide w-24"
                            >
                                Campo
                            </th>
                            <th
                                scope="col"
                                className="px-3 py-2 text-left font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Erro
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {errors.map((err, i) => (
                            <tr
                                key={`${err.row}-${err.field}-${i}`}
                                className={
                                    i < errors.length - 1 ? "border-b border-red-100" : ""
                                }
                            >
                                <td className="px-3 py-2 font-mono text-neutral-700">
                                    {err.row}
                                </td>
                                <td className="px-3 py-2 font-mono text-neutral-700">
                                    {err.field}
                                </td>
                                <td className="px-3 py-2 text-neutral-600">{err.message}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </details>
    );
}

function ImportResult({
    result,
    onImportAnother,
}: {
    result: ImportSuccessResponse;
    onImportAnother: () => void;
}) {
    const hasErrors = result.errors.length > 0;
    const hasSuccess = result.created > 0 || result.updated > 0;
    const isClean = !hasErrors;

    return (
        <div className="space-y-4">
            <div
                className={[
                    "flex items-start gap-3 rounded-md border px-4 py-3",
                    hasErrors && !hasSuccess
                        ? "border-red-200 bg-red-50"
                        : "border-primary-200 bg-primary-50",
                ].join(" ")}
            >
                <CheckCircle
                    size={20}
                    className={[
                        "flex-shrink-0 mt-0.5",
                        hasErrors && !hasSuccess ? "text-danger" : "text-primary-600",
                    ].join(" ")}
                    aria-hidden="true"
                />
                <div className="text-sm">
                    <p className="font-medium text-neutral-900">
                        {result.imported} linha{result.imported !== 1 ? "s" : ""}{" "}
                        processada{result.imported !== 1 ? "s" : ""}
                        {isClean && " — importação concluída"}
                    </p>
                    <p className="text-neutral-600 mt-0.5">
                        {result.created} criado{result.created !== 1 ? "s" : ""}
                        {" · "}
                        {result.updated} atualizado{result.updated !== 1 ? "s" : ""}
                        {hasErrors && ` · ${result.errors.length} com erro`}
                    </p>
                </div>
            </div>

            {hasErrors && <ErrorTable errors={result.errors} />}

            <button
                type="button"
                onClick={onImportAnother}
                className="text-xs text-neutral-400 underline hover:text-neutral-600 transition-colors"
            >
                Importar outro arquivo
            </button>
        </div>
    );
}

interface CsvImportModalProps {
    onClose: () => void;
    onSuccess: (message: string) => void;
}

export function CsvImportModal({ onClose, onSuccess }: CsvImportModalProps) {
    const [state, setState] = useState<ModalState>({ phase: "idle" });
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importMutation = useImportMembers();

    useEffect(() => {
        if (state.phase !== "result") return;
        if (state.result.errors.length > 0) return;

        const timer = setTimeout(() => {
            onSuccess(
                `Importação concluída: ${state.result.created} criado(s), ${state.result.updated} atualizado(s).`,
            );
            onClose();
        }, 2000);

        return () => clearTimeout(timer);
    }, [state, onSuccess, onClose]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && state.phase !== "uploading") {
                onClose();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [state.phase, onClose]);

    function selectFile(file: File) {
        const error = validateFile(file);
        if (error) {
            setState({ phase: "hard_error", message: error });
            return;
        }
        setState({ phase: "file_selected", file });
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) selectFile(file);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) selectFile(file);
        e.target.value = "";
    };

    async function handleSubmit() {
        if (state.phase !== "file_selected") return;
        const { file } = state;

        setState({ phase: "uploading", file });

        try {
            const result = await importMutation.mutateAsync(file);
            setState({ phase: "result", result, file });

            if (result.errors.length > 0) {
                onSuccess(
                    `${result.created} criado(s), ${result.updated} atualizado(s). Veja os erros abaixo.`,
                );
            }
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.message
                    : "Erro inesperado ao processar o arquivo.";
            setState({ phase: "hard_error", message });
        }
    }

    const isUploading = state.phase === "uploading";
    const showDropzone =
        state.phase === "idle" ||
        state.phase === "file_selected" ||
        state.phase === "hard_error";

    const footerActionLabel =
        state.phase === "result" || state.phase === "hard_error"
            ? "Fechar"
            : "Cancelar";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-import-modal-title"
        >
            <div className="relative w-full max-w-lg mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <h2
                        id="csv-import-modal-title"
                        className="text-lg font-semibold text-neutral-900"
                    >
                        Importar Sócios via CSV
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isUploading}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-50"
                        aria-label="Fechar modal"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
                    <CsvTemplateDownload />

                    {showDropzone && (
                        <Dropzone
                            state={state}
                            isDragging={isDragging}
                            fileInputRef={fileInputRef}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onFileInput={handleFileInput}
                            onReset={() => setState({ phase: "idle" })}
                        />
                    )}

                    {state.phase === "uploading" && (
                        <UploadingState filename={state.file.name} />
                    )}

                    {state.phase === "result" && (
                        <ImportResult
                            result={state.result}
                            onImportAnother={() => setState({ phase: "idle" })}
                        />
                    )}
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onClose}
                        disabled={isUploading}
                    >
                        {footerActionLabel}
                    </Button>

                    {state.phase === "file_selected" && (
                        <Button type="button" onClick={handleSubmit}>
                            <Upload size={15} aria-hidden="true" />
                            Importar
                        </Button>
                    )}

                    {isUploading && (
                        <Button type="button" disabled>
                            <Spinner size={15} />
                            Importando…
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}