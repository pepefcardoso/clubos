"use client";

import type { ExerciseCategory } from "@/lib/api/exercises";

interface CategoryConfig {
    label: string;
    bg: string;
    text: string;
    dot: string;
    border: string;
}

export const CATEGORY_CONFIG: Record<ExerciseCategory, CategoryConfig> = {
    STRENGTH: {
        label: "Força",
        bg: "bg-purple-50",
        text: "text-purple-700",
        dot: "bg-purple-500",
        border: "border-purple-200",
    },
    CARDIO: {
        label: "Cardio",
        bg: "bg-red-50",
        text: "text-red-700",
        dot: "bg-red-500",
        border: "border-red-200",
    },
    TECHNICAL: {
        label: "Técnico",
        bg: "bg-blue-50",
        text: "text-blue-700",
        dot: "bg-blue-500",
        border: "border-blue-200",
    },
    TACTICAL: {
        label: "Tático",
        bg: "bg-amber-50",
        text: "text-amber-700",
        dot: "bg-amber-500",
        border: "border-amber-200",
    },
    RECOVERY: {
        label: "Recuperação",
        bg: "bg-primary-50",
        text: "text-primary-700",
        dot: "bg-primary-500",
        border: "border-primary-200",
    },
    OTHER: {
        label: "Outro",
        bg: "bg-neutral-100",
        text: "text-neutral-600",
        dot: "bg-neutral-400",
        border: "border-neutral-200",
    },
};

interface Props {
    category: ExerciseCategory;
    size?: "sm" | "md";
}

export function ExerciseCategoryBadge({ category, size = "md" }: Props) {
    const cfg = CATEGORY_CONFIG[category];
    const padding =
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full font-medium border ${cfg.bg} ${cfg.text} ${cfg.border} ${padding}`}
            aria-label={cfg.label}
        >
            <span
                className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg.dot}`}
                aria-hidden="true"
            />
            {cfg.label}
        </span>
    );
}

export type { ExerciseCategory };