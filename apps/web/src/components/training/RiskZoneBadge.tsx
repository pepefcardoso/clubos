"use client";

import { cn } from "@/lib/utils";
import type { RiskZone } from "@/lib/api/workload";

export const RISK_ZONE_CONFIG: Record<
    RiskZone,
    {
        label: string;
        bgClass: string;
        textClass: string;
        dotClass: string;
        borderClass: string;
        ariaLabel: string;
    }
> = {
    insufficient_data: {
        label: "Dados insuficientes",
        bgClass: "bg-neutral-100",
        textClass: "text-neutral-500",
        dotClass: "bg-neutral-400",
        borderClass: "border-neutral-200",
        ariaLabel: "dados insuficientes para análise de risco",
    },
    low: {
        label: "Carga baixa",
        bgClass: "bg-blue-50",
        textClass: "text-blue-700",
        dotClass: "bg-blue-400",
        borderClass: "border-blue-200",
        ariaLabel: "carga de treino abaixo do ideal",
    },
    optimal: {
        label: "Ótimo",
        bgClass: "bg-primary-50",
        textClass: "text-primary-700",
        dotClass: "bg-primary-500",
        borderClass: "border-primary-200",
        ariaLabel: "carga ótima — atleta apto para jogo",
    },
    high: {
        label: "Atenção",
        bgClass: "bg-amber-50",
        textClass: "text-amber-700",
        dotClass: "bg-amber-400",
        borderClass: "border-amber-200",
        ariaLabel: "carga elevada — use com cautela",
    },
    very_high: {
        label: "Risco alto",
        bgClass: "bg-red-50",
        textClass: "text-red-700",
        dotClass: "bg-red-500",
        borderClass: "border-red-200",
        ariaLabel: "risco elevado de lesão — evitar escalação",
    },
};

interface RiskZoneBadgeProps {
    zone: RiskZone | null;
    size?: "sm" | "md" | "lg";
}

export function RiskZoneBadge({ zone, size = "md" }: RiskZoneBadgeProps) {
    const cfg = RISK_ZONE_CONFIG[zone ?? "insufficient_data"];

    const sizeClasses = {
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-xs",
        lg: "px-3 py-1.5 text-sm",
    };

    const dotSizeClasses = {
        sm: "h-1.5 w-1.5",
        md: "h-1.5 w-1.5",
        lg: "h-2 w-2",
    };

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full font-medium border",
                cfg.bgClass,
                cfg.textClass,
                cfg.borderClass,
                sizeClasses[size],
            )}
            aria-label={cfg.ariaLabel}
        >
            <span
                className={cn(
                    "rounded-full flex-shrink-0",
                    cfg.dotClass,
                    dotSizeClasses[size],
                )}
                aria-hidden="true"
            />
            {cfg.label}
        </span>
    );
}