"use client";

import { useEffect } from "react";
import { X, Dumbbell, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExerciseCategoryBadge } from "./ExerciseCategoryBadge";
import type { ExerciseResponse } from "@/lib/api/exercises";

interface Props {
    exercise: ExerciseResponse;
    isSelected: boolean;
    onToggle: (exercise: ExerciseResponse) => void;
    onClose: () => void;
}

export function ExerciseDetailModal({
    exercise,
    isSelected,
    onToggle,
    onClose,
}: Props) {
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exercise-detail-title"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="relative w-full max-w-md mx-0 sm:mx-4 bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
                <div className="flex items-start justify-between px-5 py-4 border-b border-neutral-200">
                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Dumbbell size={20} className="text-neutral-600" aria-hidden="true" />
                        </div>
                        <div>
                            <h2
                                id="exercise-detail-title"
                                className="text-base font-semibold text-neutral-900 leading-tight"
                            >
                                {exercise.name}
                            </h2>
                            <div className="mt-1">
                                <ExerciseCategoryBadge category={exercise.category} size="sm" />
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-shrink-0 ml-3 text-neutral-400 hover:text-neutral-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                        aria-label="Fechar"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4 max-h-[55dvh] overflow-y-auto">
                    {exercise.description ? (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">
                                Descrição
                            </p>
                            <p className="text-sm text-neutral-700 leading-relaxed">
                                {exercise.description}
                            </p>
                        </div>
                    ) : (
                        <p className="text-sm text-neutral-400 italic">
                            Sem descrição cadastrada.
                        </p>
                    )}

                    {exercise.muscleGroups.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">
                                Grupos Musculares
                            </p>
                            <div className="flex flex-wrap gap-1.5" role="list" aria-label="Grupos musculares trabalhados">
                                {exercise.muscleGroups.map((group) => (
                                    <span
                                        key={group}
                                        role="listitem"
                                        className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600"
                                    >
                                        {group}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 px-5 py-4 border-t border-neutral-200 bg-neutral-50">
                    <Button variant="secondary" onClick={onClose} className="flex-1">
                        Fechar
                    </Button>
                    <Button
                        onClick={() => {
                            onToggle(exercise);
                            onClose();
                        }}
                        variant={isSelected ? "secondary" : "default"}
                        className="flex-1"
                    >
                        {isSelected ? (
                            <>
                                <Minus size={15} aria-hidden="true" />
                                Remover
                            </>
                        ) : (
                            <>
                                <Plus size={15} aria-hidden="true" />
                                Selecionar
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}