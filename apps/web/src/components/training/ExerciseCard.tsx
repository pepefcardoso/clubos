"use client";

import { Dumbbell, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExerciseCategoryBadge } from "./ExerciseCategoryBadge";
import type { ExerciseResponse } from "@/lib/api/exercises";

interface Props {
    exercise: ExerciseResponse;
    isSelected: boolean;
    onToggle: (exercise: ExerciseResponse) => void;
    onDetail: (exercise: ExerciseResponse) => void;
}

export function ExerciseCard({ exercise, isSelected, onToggle, onDetail }: Props) {
    return (
        <div className="relative group">
            <button
                type="button"
                onClick={() => onToggle(exercise)}
                aria-pressed={isSelected}
                aria-label={`${exercise.name} — ${isSelected ? "Remover da seleção" : "Adicionar à seleção"}`}
                className={cn(
                    "w-full text-left rounded-lg border-2 p-3 transition-all duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                    isSelected
                        ? "border-primary-400 bg-primary-50 shadow-sm"
                        : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm",
                )}
            >
                <div className="flex items-start gap-2.5">
                    <div
                        className={cn(
                            "mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-colors",
                            isSelected ? "bg-primary-100" : "bg-neutral-100",
                        )}
                        aria-hidden="true"
                    >
                        <Dumbbell
                            size={16}
                            className={isSelected ? "text-primary-600" : "text-neutral-500"}
                        />
                    </div>

                    <div className="min-w-0 flex-1 pr-5">
                        <p
                            className={cn(
                                "truncate text-sm font-semibold leading-tight",
                                isSelected ? "text-primary-900" : "text-neutral-900",
                            )}
                        >
                            {exercise.name}
                        </p>

                        <div className="mt-1">
                            <ExerciseCategoryBadge category={exercise.category} size="sm" />
                        </div>

                        {exercise.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-neutral-500 leading-snug">
                                {exercise.description}
                            </p>
                        )}

                        {exercise.muscleGroups.length > 0 && (
                            <div
                                className="mt-1.5 flex flex-wrap gap-1"
                                aria-label="Grupos musculares"
                            >
                                {exercise.muscleGroups.slice(0, 3).map((group) => (
                                    <span
                                        key={group}
                                        className="rounded bg-neutral-100 px-1.5 py-0.5 text-[0.625rem] font-medium text-neutral-500"
                                    >
                                        {group}
                                    </span>
                                ))}
                                {exercise.muscleGroups.length > 3 && (
                                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[0.625rem] font-medium text-neutral-400">
                                        +{exercise.muscleGroups.length - 3}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {isSelected && (
                        <div
                            className="absolute top-2.5 right-8 h-5 w-5 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0"
                            aria-hidden="true"
                        >
                            <svg
                                viewBox="0 0 10 8"
                                fill="none"
                                className="h-2.5 w-2.5"
                                aria-hidden="true"
                            >
                                <path
                                    d="M1 4l2.5 2.5L9 1"
                                    stroke="white"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </div>
                    )}
                </div>
            </button>

            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onDetail(exercise);
                }}
                aria-label={`Ver detalhes de ${exercise.name}`}
                className={cn(
                    "absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded",
                    "text-neutral-300 hover:text-neutral-500 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                    "opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
                )}
            >
                <Info size={14} aria-hidden="true" />
            </button>
        </div>
    );
}