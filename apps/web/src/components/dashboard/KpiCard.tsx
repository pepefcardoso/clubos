"use client";

import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
    label: string;
    value: string;
    subtext?: string;
    icon: LucideIcon;
    variant?: "default" | "success" | "danger" | "warning";
    isLoading?: boolean;
}

const variantStyles = {
    default: {
        iconWrapper: "bg-neutral-100",
        icon: "text-neutral-500",
        value: "text-neutral-900",
        border: "border-neutral-200",
        accent: "",
    },
    success: {
        iconWrapper: "bg-primary-50",
        icon: "text-primary-600",
        value: "text-primary-700",
        border: "border-neutral-200",
        accent: "after:bg-primary-500",
    },
    danger: {
        iconWrapper: "bg-red-50",
        icon: "text-danger",
        value: "text-danger",
        border: "border-neutral-200",
        accent: "after:bg-danger",
    },
    warning: {
        iconWrapper: "bg-amber-50",
        icon: "text-amber-600",
        value: "text-amber-700",
        border: "border-neutral-200",
        accent: "after:bg-amber-400",
    },
} as const;

export function KpiCard({
    label,
    value,
    subtext,
    icon: Icon,
    variant = "default",
    isLoading = false,
}: KpiCardProps) {
    const styles = variantStyles[variant];

    if (isLoading) {
        return (
            <div
                className="relative bg-white border border-neutral-200 rounded-md p-6 space-y-4 overflow-hidden"
                aria-busy="true"
                aria-label="Carregando indicador"
            >
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-neutral-200 animate-pulse flex-shrink-0" />
                    <div className="h-3.5 w-24 rounded bg-neutral-200 animate-pulse" />
                </div>

                <div className="h-8 w-28 rounded bg-neutral-200 animate-pulse" />

                <div className="h-3 w-20 rounded bg-neutral-200 animate-pulse" />
            </div>
        );
    }

    return (
        <div
            className={cn(
                "relative bg-white border rounded-md p-6 space-y-3 overflow-hidden transition-shadow hover:shadow-md",
                styles.border,
            )}
        >
            <div
                className={cn(
                    "absolute top-0 left-0 right-0 h-0.5 rounded-t-md",
                    variant === "success" && "bg-primary-500",
                    variant === "danger" && "bg-danger",
                    variant === "warning" && "bg-amber-400",
                    variant === "default" && "bg-neutral-200",
                )}
                aria-hidden="true"
            />

            <div className="flex items-center gap-2.5 pt-1">
                <div
                    className={cn("p-1.5 rounded-md flex-shrink-0", styles.iconWrapper)}
                >
                    <Icon size={18} className={styles.icon} aria-hidden="true" />
                </div>
                <span className="text-sm font-medium text-neutral-500 leading-none">
                    {label}
                </span>
            </div>

            <p
                className={cn(
                    "font-mono text-2xl font-semibold tracking-tight leading-none",
                    styles.value,
                )}
            >
                {value}
            </p>

            {subtext && (
                <p className="text-xs text-neutral-400 leading-snug">{subtext}</p>
            )}
        </div>
    );
}