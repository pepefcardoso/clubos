"use client";

import { useState } from "react";
import { X, Copy, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChargeListItem } from "@/lib/api/charges";

function formatBRL(cents: number): string {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(cents / 100);
}

/**
 * Resolves the correct display strategy from a charge's gatewayMeta.
 *
 * Four branches:
 *   "base64"      — Asaas / Pagarme: inline base64 PNG
 *   "url"         — Stripe: hosted PNG URL
 *   "static_pix"  — last-resort fallback: show pixKey text only
 *   "none"        — no QR data available (offline methods, null meta)
 */
export function resolveQrDisplay(charge: ChargeListItem): {
    type: "base64" | "url" | "static_pix" | "none";
    imgSrc?: string;
    pixCopyPaste?: string;
    pixKey?: string;
} {
    const meta = charge.gatewayMeta;
    if (!meta) return { type: "none" };

    if (
        meta["type"] === "static_pix" &&
        typeof meta["pixKey"] === "string"
    ) {
        return { type: "static_pix", pixKey: meta["pixKey"] as string };
    }

    if (
        charge.gatewayName === "stripe" &&
        typeof meta["qrCodeUrl"] === "string"
    ) {
        return {
            type: "url",
            imgSrc: meta["qrCodeUrl"] as string,
            pixCopyPaste:
                typeof meta["pixCopyPaste"] === "string"
                    ? (meta["pixCopyPaste"] as string)
                    : undefined,
        };
    }

    if (typeof meta["qrCodeBase64"] === "string") {
        return {
            type: "base64",
            imgSrc: `data:image/png;base64,${meta["qrCodeBase64"] as string}`,
            pixCopyPaste:
                typeof meta["pixCopyPaste"] === "string"
                    ? (meta["pixCopyPaste"] as string)
                    : undefined,
        };
    }

    return { type: "none" };
}

interface QrCodeModalProps {
    charge: ChargeListItem;
    onClose: () => void;
}

export function QrCodeModal({ charge, onClose }: QrCodeModalProps) {
    const [copied, setCopied] = useState(false);

    const qr = resolveQrDisplay(charge);

    const handleCopy = async (text: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-modal-title"
            onClick={handleBackdropClick}
        >
            <div className="relative w-full max-w-sm mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <h2
                        id="qr-modal-title"
                        className="text-base font-semibold text-neutral-900"
                    >
                        Cobrança Pix
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
                        aria-label="Fechar modal"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <div className="px-5 py-5 space-y-4">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Sócio</span>
                            <span className="font-medium text-neutral-900">
                                {charge.memberName}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Valor</span>
                            <span className="font-mono font-semibold text-neutral-900">
                                {formatBRL(charge.amountCents)}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Vencimento</span>
                            <span className="text-neutral-700">
                                {new Intl.DateTimeFormat("pt-BR").format(
                                    new Date(charge.dueDate),
                                )}
                            </span>
                        </div>
                    </div>

                    <hr className="border-neutral-100" />

                    {qr.type === "base64" || qr.type === "url" ? (
                        <div className="flex flex-col items-center gap-3">
                            <img
                                src={qr.imgSrc}
                                alt="QR Code Pix"
                                className="w-52 h-52 rounded border border-neutral-200 object-contain"
                            />
                            {qr.pixCopyPaste && (
                                <button
                                    type="button"
                                    onClick={() => handleCopy(qr.pixCopyPaste!)}
                                    className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 transition-colors"
                                    aria-label="Copiar código Pix"
                                >
                                    {copied ? (
                                        <CheckCircle size={13} className="text-primary-500" aria-hidden="true" />
                                    ) : (
                                        <Copy size={13} aria-hidden="true" />
                                    )}
                                    <span>{copied ? "Copiado!" : "Copiar código Pix"}</span>
                                </button>
                            )}
                        </div>
                    ) : qr.type === "static_pix" ? (
                        <div className="space-y-3">
                            <div className="flex items-start gap-2.5 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5">
                                <AlertTriangle
                                    size={15}
                                    className="flex-shrink-0 text-amber-600 mt-0.5"
                                    aria-hidden="true"
                                />
                                <p className="text-xs text-amber-800 leading-relaxed">
                                    Cobrança gerada com a chave Pix estática do clube — os
                                    gateways estavam indisponíveis no momento da geração.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded px-3 py-2">
                                <span className="flex-1 font-mono text-sm text-neutral-800 break-all">
                                    {qr.pixKey}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleCopy(qr.pixKey!)}
                                    className="flex-shrink-0 p-1 rounded text-primary-600 hover:text-primary-700 hover:bg-primary-50 transition-colors"
                                    aria-label="Copiar chave Pix"
                                >
                                    {copied ? (
                                        <CheckCircle size={14} className="text-primary-500" aria-hidden="true" />
                                    ) : (
                                        <Copy size={14} aria-hidden="true" />
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-neutral-500 text-center py-6">
                            Sem dados de QR Code para esta cobrança.
                        </p>
                    )}
                </div>

                <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-200 flex justify-end">
                    <Button variant="secondary" onClick={onClose}>
                        Fechar
                    </Button>
                </div>
            </div>
        </div>
    );
}