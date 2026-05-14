"use client";

import { useState, useCallback } from "react";
import { Users, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { ScoutSearchFilters } from "./ScoutSearchFilters";
import { AthleteResultCard } from "./AthleteResultCard";
import { Button } from "@/components/ui/button";
import { useScoutSearch } from "@/hooks/use-scout-search";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { ScoutSearchParams } from "@/lib/api/scout-search";
import { ScoutAthleteResult } from "../../../../../packages/shared-types/src";

const LIMIT = 20;

type FilterValues = Omit<ScoutSearchParams, "page" | "limit">;

const EMPTY_FILTERS: FilterValues = {};

function SkeletonCard() {
    return (
        <div
            className="rounded-md border border-neutral-200 bg-white shadow-sm overflow-hidden"
            aria-hidden="true"
        >
            <div className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-neutral-200 animate-pulse" />
                    <div className="space-y-1.5 flex-1">
                        <div className="h-3 w-2/3 rounded bg-neutral-200 animate-pulse" />
                        <div className="h-2.5 w-1/2 rounded bg-neutral-200 animate-pulse" />
                    </div>
                </div>
                <div className="h-5 w-24 rounded-full bg-neutral-200 animate-pulse" />
                <div className="grid grid-cols-3 gap-2">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-12 rounded bg-neutral-200 animate-pulse" />
                    ))}
                </div>
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-2 rounded bg-neutral-200 animate-pulse" />
                    ))}
                </div>
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center gap-2 py-16">
            <Users size={48} className="text-neutral-300" aria-hidden="true" />
            <p className="font-medium text-neutral-700">Nenhum atleta encontrado</p>
            <p className="text-sm text-neutral-500">Ajuste os filtros para ampliar a busca.</p>
        </div>
    );
}

function ErrorBanner({ message }: { message: string }) {
    return (
        <div
            role="alert"
            className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
            <AlertCircle size={16} className="flex-shrink-0" aria-hidden="true" />
            {message}
        </div>
    );
}

export function ScoutSearchPage() {
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);

    const debouncedMinAcwr = useDebouncedValue(filters.minAcwr, 500);
    const debouncedMaxAcwr = useDebouncedValue(filters.maxAcwr, 500);
    const debouncedMinAge = useDebouncedValue(filters.minAge, 500);
    const debouncedMaxAge = useDebouncedValue(filters.maxAge, 500);

    const queryParams: ScoutSearchParams = {
        ...filters,
        minAge: debouncedMinAge,
        maxAge: debouncedMaxAge,
        minAcwr: debouncedMinAcwr,
        maxAcwr: debouncedMaxAcwr,
        page,
        limit: LIMIT,
    };

    const { data, isLoading, isError, error } = useScoutSearch(queryParams);

    const handleFilterChange = useCallback((next: Partial<FilterValues>) => {
        setFilters((prev) => ({ ...prev, ...next }));
        setPage(1);
    }, []);

    const handleClear = useCallback(() => {
        setFilters(EMPTY_FILTERS);
        setPage(1);
    }, []);

    const total = data?.total ?? 0;
    const from = total === 0 ? 0 : (page - 1) * LIMIT + 1;
    const to = Math.min(page * LIMIT, total);
    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                    Buscar Atletas
                </h1>
                <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                    Encontre atletas verificados em todo o Brasil.
                </p>
            </div>

            <ScoutSearchFilters
                values={filters}
                onChange={handleFilterChange}
                onClear={handleClear}
            />

            {isError && (
                <ErrorBanner
                    message={
                        error instanceof Error
                            ? error.message
                            : "Não foi possível carregar os atletas. Tente novamente."
                    }
                />
            )}

            {!isLoading && !isError && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-neutral-500" aria-live="polite" aria-atomic="true">
                        {total === 0
                            ? "Nenhum resultado"
                            : `${from}–${to} de ${total} atleta${total !== 1 ? "s" : ""}`}
                    </p>
                </div>
            )}

            {isLoading ? (
                <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                    aria-busy="true"
                    aria-label="Carregando atletas…"
                >
                    {[...Array(8)].map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            ) : total === 0 ? (
                <EmptyState />
            ) : (
                <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                    aria-label={`${total} atleta${total !== 1 ? "s" : ""} encontrado${total !== 1 ? "s" : ""}`}
                >
                    {data?.data.map((result: ScoutAthleteResult) => (
                        <AthleteResultCard key={result.id} result={result} />
                    ))}
                </div>
            )}

            {!isLoading && total > LIMIT && (
                <div className="flex items-center justify-between pt-2">
                    <p className="text-sm text-neutral-500">
                        Página {page} de {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                            aria-label="Página anterior"
                        >
                            <ChevronLeft size={14} aria-hidden="true" />
                            Anterior
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                            aria-label="Próxima página"
                        >
                            Próxima
                            <ChevronRight size={14} aria-hidden="true" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}