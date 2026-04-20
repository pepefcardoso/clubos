"use client";

import { CheckCircle, XCircle, Clock, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScanState } from "@/hooks/use-access-scanner";

interface ScanResultOverlayProps {
    state: ScanState;
    /** If provided, tapping the overlay calls this (allows early dismiss) */
    onDismiss?: () => void;
}

interface OverlayConfig {
    bg: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
}

function getConfig(state: ScanState): OverlayConfig | null {
    switch (state.phase) {
        case "idle":
        case "detecting":
            return null;

        case "processing":
            return {
                bg: "bg-neutral-900/90",
                icon: (
                    <div className="w-20 h-20 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                ),
                title: "Verificando…",
                subtitle: "",
            };

        case "result":
            return state.valid
                ? {
                    bg: "bg-emerald-600",
                    icon: (
                        <CheckCircle
                            size={100}
                            className="text-white drop-shadow-lg"
                            strokeWidth={1.5}
                        />
                    ),
                    title: "ACESSO LIBERADO",
                    subtitle: "",
                }
                : {
                    bg: "bg-red-600",
                    icon: (
                        <XCircle
                            size={100}
                            className="text-white drop-shadow-lg"
                            strokeWidth={1.5}
                        />
                    ),
                    title: "ACESSO NEGADO",
                    subtitle: state.reason ?? "QR Code inválido ou expirado.",
                };

        case "queued":
            return {
                bg: "bg-amber-600",
                icon: <WifiOff size={80} className="text-white drop-shadow-lg" />,
                title: "SEM CONEXÃO",
                subtitle: "Scan salvo. Será sincronizado ao reconectar.",
            };

        case "error":
            return {
                bg: "bg-red-700",
                icon: <XCircle size={80} className="text-white drop-shadow-lg" strokeWidth={1.5} />,
                title: "ERRO",
                subtitle: state.message,
            };
    }
}

/**
 * Full-screen overlay that covers the QR scanner with an animated result.
 *
 * Accessibility:
 * - `role="alert"` + `aria-live="assertive"` ensures screen readers announce
 *   the result immediately, critical for gate staff using assistive tech.
 * - Rendered into the same stacking context as the scanner so it correctly
 *   covers both the video feed and the reticle overlay.
 *
 * Performance:
 * - Pure CSS animation (`animate-in fade-in`) — no JS animation overhead.
 * - No async work in the render path; config is computed synchronously.
 */
export function ScanResultOverlay({ state, onDismiss }: ScanResultOverlayProps) {
    const config = getConfig(state);

    if (!config) return null;

    return (
        <div
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            onClick={onDismiss}
            className={cn(
                "absolute inset-0 z-20 flex flex-col items-center justify-center gap-6",
                "select-none",
                "animate-in fade-in duration-100",
                config.bg,
                onDismiss && "cursor-pointer",
            )}
        >
            <div className="flex flex-col items-center gap-5 px-6 text-center">
                {config.icon}

                <p
                    className="text-white font-black tracking-[0.15em] leading-none"
                    style={{ fontSize: "clamp(1.75rem, 7vw, 2.5rem)" }}
                >
                    {config.title}
                </p>

                {config.subtitle && (
                    <p className="text-white/85 text-lg leading-snug max-w-xs">
                        {config.subtitle}
                    </p>
                )}

                {onDismiss && state.phase !== "processing" && (
                    <p className="text-white/50 text-xs mt-2">Toque para continuar</p>
                )}
            </div>
        </div>
    );
}