"use client";

import { cn } from "@/lib/utils";
import type { InjuryGrade } from "@/lib/api/medical-records";

interface GradeConfig {
    label: string;
    /** Short description shown in tooltips and screen readers */
    description: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    dotClass: string;
}

export const GRADE_CONFIG: Record<InjuryGrade, GradeConfig> = {
    GRADE_1: {
        label: "Grau I",
        description: "Leve — retorno em até 7 dias",
        bgClass: "bg-primary-50",
        textClass: "text-primary-700",
        borderClass: "border-primary-200",
        dotClass: "bg-primary-500",
    },
    GRADE_2: {
        label: "Grau II",
        description: "Moderado — retorno em 7–28 dias",
        bgClass: "bg-amber-50",
        textClass: "text-amber-700",
        borderClass: "border-amber-200",
        dotClass: "bg-amber-400",
    },
    GRADE_3: {
        label: "Grau III",
        description: "Grave — retorno acima de 28 dias",
        bgClass: "bg-orange-50",
        textClass: "text-orange-700",
        borderClass: "border-orange-200",
        dotClass: "bg-orange-500",
    },
    COMPLETE: {
        label: "Ruptura",
        description: "Ruptura completa — avaliação cirúrgica",
        bgClass: "bg-red-50",
        textClass: "text-red-700",
        borderClass: "border-red-200",
        dotClass: "bg-red-500",
    },
};

interface InjuryGradeBadgeProps {
    grade: InjuryGrade;
    size?: "sm" | "md";
    /** When true, appends the description text inline after the label. */
    showDescription?: boolean;
}

/**
 * Pill badge for injury severity grade (FIFA Medical 2023 classification).
 *
 * Used by:
 *   - MedicalRecordFormModal — grade radio card buttons
 *   - MedicalTimeline (T-118) — timeline event chips
 *   - MedicalRecordsSummary tables
 *
 * Each grade has a distinct colour to convey severity at a glance:
 *   GRADE_1 → green (primary)
 *   GRADE_2 → amber
 *   GRADE_3 → orange
 *   COMPLETE → red
 */
export function InjuryGradeBadge({
    grade,
    size = "md",
    showDescription = false,
}: InjuryGradeBadgeProps) {
    const cfg = GRADE_CONFIG[grade];

    const paddingClass =
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";
    const dotSizeClass = size === "sm" ? "h-1.5 w-1.5" : "h-1.5 w-1.5";

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full font-medium border",
                cfg.bgClass,
                cfg.textClass,
                cfg.borderClass,
                paddingClass,
            )}
            title={cfg.description}
            aria-label={`${cfg.label}: ${cfg.description}`}
        >
            <span
                className={cn("rounded-full flex-shrink-0", cfg.dotClass, dotSizeClass)}
                aria-hidden="true"
            />
            {cfg.label}
            {showDescription && (
                <span className="font-normal opacity-75">— {cfg.description}</span>
            )}
        </span>
    );
}