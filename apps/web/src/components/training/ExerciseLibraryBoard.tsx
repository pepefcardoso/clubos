"use client";

import { useState, useMemo } from "react";
import { Search, BookOpen, ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useExercises } from "@/hooks/use-exercises";
import { ExerciseCard } from "./ExerciseCard";
import { CATEGORY_CONFIG } from "./ExerciseCategoryBadge";
import { ExerciseDetailModal } from "./ExerciseDetailModal";
import type { ExerciseResponse, ExerciseCategory } from "@/lib/api/exercises";

const ALL_CATEGORIES: ExerciseCategory[] = [
    "STRENGTH",
    "CARDIO",
    "TECHNICAL",
    "TACTICAL",
    "RECOVERY",
    "OTHER",
];

function SkeletonGrid() {
    return (
        <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            aria-busy="true"
            aria-label="Carregando exercícios…"
        >
            {Array.from({ length: 9 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-lg border-2 border-neutral-200 bg-white p-3 space-y-2"
                >
                    <div className="flex gap-2.5">
                        <div
                            className="h-8 w-8 rounded-md bg-neutral-200 animate-pulse flex-shrink-0"
                            style={{ animationDelay: `${i * 40}ms` }}
                        />
                        <div className="flex-1 space-y-1.5 pt-0.5">
                            <div
                                className="h-3.5 rounded bg-neutral-200 animate-pulse"
                                style={{ width: `${55 + (i * 13) % 35}%`, animationDelay: `${i * 40}ms` }}
                            />
                            <div
                                className="h-4 w-16 rounded-full bg-neutral-200 animate-pulse"
                                style={{ animationDelay: `${i * 40 + 20}ms` }}
                            />
                        </div>
                    </div>
                    <div className="flex gap-1 pl-10">
                        <div className="h-4 w-12 rounded bg-neutral-200 animate-pulse" />
                        <div className="h-4 w-10 rounded bg-neutral-200 animate-pulse" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen
                size={48}
                className="text-neutral-300 mb-3"
                aria-hidden="true"
            />
            <p className="text-neutral-600 font-medium text-[0.9375rem]">
                {hasFilters ? "Nenhum exercício encontrado" : "Biblioteca vazia"}
            </p>
            <p className="text-neutral-400 text-sm mt-1 max-w-xs leading-relaxed">
                {hasFilters
                    ? "Tente outros filtros ou termos de busca."
                    : "Cadastre exercícios no painel do ADMIN para começar."}
            </p>
        </div>
    );
}

interface SelectionTrayProps {
    selected: ExerciseResponse[];
    onRemove: (id: string) => void;
    onClear: () => void;
}

function SelectionTray({ selected, onRemove, onClear }: SelectionTrayProps) {
    if (selected.length === 0) return null;

    return (
        <div
            role="region"
            aria-label="Exercícios selecionados"
            className="border-t-2 border-primary-200 bg-white px-4 py-3"
        >
            <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-primary-700">
                    {selected.length} exercício{selected.length !== 1 ? "s" : ""}{" "}
                    selecionado{selected.length !== 1 ? "s" : ""}
                </p>
                <button
                    type="button"
                    onClick={onClear}
                    className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                >
                    Limpar seleção
                </button>
            </div>
            <div
                className="flex gap-2 overflow-x-auto pb-1"
                role="list"
                aria-label="Exercícios selecionados"
            >
                {selected.map((ex) => (
                    <button
                        key={ex.id}
                        type="button"
                        role="listitem"
                        onClick={() => onRemove(ex.id)}
                        aria-label={`Remover ${ex.name} da seleção`}
                        className="flex-shrink-0 flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    >
                        {ex.name}
                        <span aria-hidden="true" className="text-primary-400">×</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

interface ExerciseLibraryBoardProps {
    /**
     * Called when the user finalises a selection.
     */
    onSelectionConfirm?: (selected: ExerciseResponse[]) => void;
}

export function ExerciseLibraryBoard(
    //eslint-disable-next-line @typescript-eslint/no-unused-vars
    _props: ExerciseLibraryBoardProps,
) {
    const [search, setSearch] = useState("");
    const [activeCategory, setActiveCategory] =
        useState<ExerciseCategory | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [detailExercise, setDetailExercise] =
        useState<ExerciseResponse | null>(null);

    const { data = [], isLoading, isError } = useExercises({
        search: search.trim() || undefined,
        category: activeCategory ?? undefined,
    });

    const selectedExercises = useMemo(
        () => data.filter((ex) => selectedIds.has(ex.id)),
        [data, selectedIds],
    );

    const categoryCounts = useMemo<Partial<Record<ExerciseCategory, number>>>(
        () => {
            const counts: Partial<Record<ExerciseCategory, number>> = {};
            for (const ex of data) {
                counts[ex.category] = (counts[ex.category] ?? 0) + 1;
            }
            return counts;
        },
        [data],
    );

    const hasFilters = !!search.trim() || !!activeCategory;

    const handleToggle = (exercise: ExerciseResponse) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(exercise.id)) {
                next.delete(exercise.id);
            } else {
                next.add(exercise.id);
            }
            return next;
        });
    };

    const handleRemoveFromTray = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const handleCategoryClick = (cat: ExerciseCategory) => {
        setActiveCategory((prev) => (prev === cat ? null : cat));
    };

    return (
        <section
            aria-labelledby="exercise-library-heading"
            className="bg-white rounded-lg border border-neutral-200 overflow-hidden"
        >
            <div className="px-4 py-3 border-b border-neutral-200">
                <div className="flex items-center gap-2 mb-3">
                    <BookOpen
                        size={16}
                        className="text-primary-600 flex-shrink-0"
                        aria-hidden="true"
                    />
                    <h2
                        id="exercise-library-heading"
                        className="text-sm font-semibold text-neutral-900"
                    >
                        Biblioteca de Exercícios
                    </h2>
                    {data.length > 0 && !isLoading && (
                        <span className="ml-auto text-xs text-neutral-400 tabular-nums">
                            {data.length} exercício{data.length !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>

                <div className="relative">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                        aria-hidden="true"
                    />
                    <Input
                        type="search"
                        placeholder="Buscar exercício…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                        aria-label="Buscar exercícios por nome"
                    />
                </div>
            </div>

            <div
                className="flex gap-2 overflow-x-auto px-4 py-2.5 border-b border-neutral-100 bg-neutral-50"
                role="tablist"
                aria-label="Filtrar por categoria"
            >
                <button
                    role="tab"
                    type="button"
                    aria-selected={activeCategory === null}
                    onClick={() => setActiveCategory(null)}
                    className={cn(
                        "flex-shrink-0 h-7 px-3 rounded-full text-xs font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                        activeCategory === null
                            ? "bg-primary-500 text-white"
                            : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100",
                    )}
                >
                    <span className="flex items-center gap-1.5">
                        <ListFilter size={11} aria-hidden="true" />
                        Todos
                    </span>
                </button>

                {ALL_CATEGORIES.map((cat) => {
                    const cfg = CATEGORY_CONFIG[cat];
                    const count = categoryCounts[cat] ?? 0;
                    const active = activeCategory === cat;

                    return (
                        <button
                            key={cat}
                            role="tab"
                            type="button"
                            aria-selected={active}
                            onClick={() => handleCategoryClick(cat)}
                            className={cn(
                                "flex-shrink-0 h-7 px-3 rounded-full text-xs font-medium transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                                active
                                    ? `${cfg.bg} ${cfg.text} border ${cfg.border}`
                                    : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50",
                            )}
                        >
                            <span className="flex items-center gap-1.5">
                                {cfg.label}
                                {count > 0 && (
                                    <span
                                        className={cn(
                                            "rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold leading-none",
                                            active
                                                ? "bg-black/10"
                                                : "bg-neutral-100 text-neutral-400",
                                        )}
                                    >
                                        {count}
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>

            {isError && (
                <div
                    role="alert"
                    className="mx-4 mt-3 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-danger"
                >
                    Não foi possível carregar os exercícios. Exibindo cache local, se disponível.
                </div>
            )}

            <div className="p-4 min-h-[280px]">
                {isLoading ? (
                    <SkeletonGrid />
                ) : data.length === 0 ? (
                    <EmptyState hasFilters={hasFilters} />
                ) : (
                    <div
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                        role="list"
                        aria-label="Exercícios disponíveis"
                    >
                        {data.map((exercise) => (
                            <div key={exercise.id} role="listitem">
                                <ExerciseCard
                                    exercise={exercise}
                                    isSelected={selectedIds.has(exercise.id)}
                                    onToggle={handleToggle}
                                    onDetail={setDetailExercise}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <SelectionTray
                selected={selectedExercises}
                onRemove={handleRemoveFromTray}
                onClear={() => setSelectedIds(new Set())}
            />

            {detailExercise && (
                <ExerciseDetailModal
                    exercise={detailExercise}
                    isSelected={selectedIds.has(detailExercise.id)}
                    onToggle={handleToggle}
                    onClose={() => setDetailExercise(null)}
                />
            )}
        </section>
    );
}