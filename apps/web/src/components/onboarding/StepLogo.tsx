"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImageIcon, Upload, X } from "lucide-react";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface StepLogoProps {
    currentFile: File | null;
    previewUrl: string | null;
    onNext: (file: File | null) => void;
    onBack: () => void;
}

export function StepLogo({ currentFile, previewUrl, onNext, onBack }: StepLogoProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [localFile, setLocalFile] = useState<File | null>(currentFile);
    const [localPreview, setLocalPreview] = useState<string | null>(previewUrl);
    const [isDragging, setIsDragging] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);

    useEffect(() => {
        return () => {
            if (localPreview && localPreview !== previewUrl) {
                URL.revokeObjectURL(localPreview);
            }
        };
    }, [localPreview, previewUrl]);

    function handleFile(file: File) {
        setFileError(null);

        if (!ACCEPTED_TYPES.includes(file.type)) {
            setFileError("Apenas imagens JPEG, PNG ou WebP são aceitas.");
            return;
        }
        if (file.size > MAX_SIZE_BYTES) {
            setFileError("A imagem deve ter no máximo 5 MB.");
            return;
        }

        if (localPreview) URL.revokeObjectURL(localPreview);
        const url = URL.createObjectURL(file);
        setLocalFile(file);
        setLocalPreview(url);
    }

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = "";
    }

    function handleDrop(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }

    function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setIsDragging(true);
    }

    function handleDragLeave() {
        setIsDragging(false);
    }

    function handleRemove() {
        if (localPreview) URL.revokeObjectURL(localPreview);
        setLocalFile(null);
        setLocalPreview(null);
        setFileError(null);
    }

    return (
        <div className="space-y-5">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold text-neutral-900">Logo do clube</h2>
                <p className="text-sm text-neutral-500">
                    Adicione uma imagem para identificar seu clube. Você pode pular essa etapa
                    e adicionar depois.
                </p>
            </div>

            {!localFile ? (
                <div
                    role="button"
                    tabIndex={0}
                    aria-label="Área para fazer upload de logo"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                    }}
                    className={[
                        "border-2 border-dashed rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none",
                        isDragging
                            ? "border-primary-400 bg-primary-50"
                            : "border-neutral-300 hover:border-primary-300 hover:bg-neutral-50",
                    ].join(" ")}
                >
                    <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center">
                        <Upload className="w-5 h-5 text-neutral-400" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-neutral-700">
                            Arraste uma imagem ou{" "}
                            <span className="text-primary-600">clique para selecionar</span>
                        </p>
                        <p className="text-xs text-neutral-400 mt-0.5">
                            JPEG, PNG ou WebP — máx. 5 MB
                        </p>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        aria-hidden="true"
                        tabIndex={-1}
                        onChange={handleInputChange}
                    />
                </div>
            ) : (
                <div className="flex items-center gap-4 p-4 border border-neutral-200 rounded-lg bg-neutral-50">
                    <div className="relative">
                        {localPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={localPreview}
                                alt="Preview do logo"
                                className="w-16 h-16 rounded-full object-cover border border-neutral-200"
                            />
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-neutral-200 flex items-center justify-center">
                                <ImageIcon className="w-6 h-6 text-neutral-400" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-800 truncate">
                            {localFile.name}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                            {(localFile.size / 1024).toFixed(0)} KB
                        </p>
                        <button
                            type="button"
                            onClick={handleRemove}
                            className="text-xs text-danger hover:underline mt-1 flex items-center gap-1"
                        >
                            <X className="w-3 h-3" />
                            Remover
                        </button>
                    </div>
                </div>
            )}

            {fileError && (
                <p className="text-danger text-sm">{fileError}</p>
            )}

            <div className="flex items-center gap-3 pt-2">
                <button
                    type="button"
                    onClick={onBack}
                    className="h-9 px-4 text-sm font-medium rounded border border-neutral-300 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar
                </button>

                {localFile ? (
                    <button
                        type="button"
                        onClick={() => onNext(localFile)}
                        className="h-9 px-5 text-sm font-medium rounded bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 transition-colors flex items-center gap-2"
                    >
                        Próximo
                        <ArrowRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => onNext(null)}
                        className="h-9 px-4 text-sm font-medium rounded text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                    >
                        Pular por agora
                    </button>
                )}
            </div>
        </div>
    );
}