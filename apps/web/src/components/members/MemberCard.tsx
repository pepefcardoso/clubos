"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import type { MemberCardResponse } from "@/lib/api/member-card";
import { cn } from "@/lib/utils";
import Image from "next/image";

const STATUS_LABELS: Record<string, string> = {
    ACTIVE: "Ativo",
    INACTIVE: "Inativo",
    OVERDUE: "Inadimplente",
};

const STATUS_COLORS: Record<string, string> = {
    ACTIVE: "bg-primary-500 text-white",
    INACTIVE: "bg-neutral-500 text-white",
    OVERDUE: "bg-danger text-white",
};

function formatDate(iso: string): string {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(iso));
}

interface MemberCardProps {
    data: MemberCardResponse;
    /**
     * Base URL for the verification page.
     * Defaults to `window.location.origin` in the browser.
     * Override in tests or SSR contexts.
     */
    verificationBaseUrl?: string;
}

/**
 * Renders a physical-card-style digital membership card with an embedded
 * QR code pointing to the public verification page.
 *
 * The QR code is generated entirely client-side by the `qrcode` package —
 * no backend round-trip required for QR rendering.
 *
 * Design principles (from ui-guidelines.md):
 *   - Green-on-green gradient matching the ClubOS primary palette
 *   - JetBrains Mono for the member name (financial/technical data)
 *   - Status badge in contrasting color so it's visible at a glance
 *   - White QR canvas for maximum scanner contrast
 */
export function MemberCard({ data, verificationBaseUrl }: MemberCardProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const baseUrl =
        verificationBaseUrl ??
        (typeof window !== "undefined" ? window.location.origin : "");

    const verifyUrl = `${baseUrl}/verificar?token=${encodeURIComponent(data.cardToken)}`;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        QRCode.toCanvas(canvas, verifyUrl, {
            width: 128,
            margin: 1,
            color: {
                dark: "#1a481a",
                light: "#ffffff",
            },
        }).catch((err: unknown) => {
            console.error("[MemberCard] QR generation failed:", err);
        });
    }, [verifyUrl]);

    const statusLabel = STATUS_LABELS[data.member.status] ?? data.member.status;
    const statusClass =
        STATUS_COLORS[data.member.status] ?? "bg-neutral-500 text-white";

    return (
        <article
            aria-label={`Carteirinha digital de ${data.member.name}`}
            className="w-full max-w-sm mx-auto rounded-xl overflow-hidden shadow-lg select-none"
            style={{
                background:
                    "linear-gradient(135deg, #1a481a 0%, #2d7d2d 60%, #4d9e4d 100%)",
            }}
        >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2.5">
                    {data.club.logoUrl ? (
                        <div className="relative w-10 h-10 flex-shrink-0">
                            <Image
                                src={data.club.logoUrl}
                                alt={`Logo ${data.club.name}`}
                                width={40}
                                height={40}
                                className="rounded-full object-cover bg-white/20"
                                priority
                            />
                        </div>
                    ) : (
                        <div
                            className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0"
                            aria-hidden="true"
                        >
                            <span className="text-white font-bold text-sm">
                                {data.club.name.charAt(0).toUpperCase()}
                            </span>
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-white font-bold text-sm leading-tight truncate max-w-[140px]">
                            {data.club.name}
                        </p>
                        <p className="text-primary-200 text-xs">Carteirinha Digital</p>
                    </div>
                </div>

                <span
                    className={cn(
                        "text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0",
                        statusClass,
                    )}
                >
                    {statusLabel}
                </span>
            </div>

            <div className="flex items-end justify-between px-5 pb-4 gap-4">
                <div className="flex-1 min-w-0">
                    <p className="text-primary-200 text-xs mb-1 uppercase tracking-wider">
                        Sócio
                    </p>
                    <p className="text-white font-bold text-lg leading-snug font-mono truncate">
                        {data.member.name}
                    </p>
                    <p className="text-primary-200 text-xs mt-2">
                        Associado desde {formatDate(data.member.joinedAt)}
                    </p>
                    <p className="text-primary-300 text-[0.625rem] mt-1">
                        Válida até {formatDate(data.expiresAt)}
                    </p>
                </div>

                <div
                    className="bg-white rounded-lg p-1.5 flex-shrink-0"
                    aria-label="QR Code de verificação — aponte a câmera para verificar"
                >
                    <canvas
                        ref={canvasRef}
                        aria-hidden="true"
                        className="block"
                    />
                </div>
            </div>

            <div className="bg-black/20 px-5 py-2">
                <p className="text-primary-300 text-[0.625rem] text-center tracking-wide">
                    Aponte a câmera para verificar este sócio
                </p>
            </div>
        </article>
    );
}