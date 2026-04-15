"use client";

import { useState } from "react";
import { Trophy, AlertTriangle, Clock, Info, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAttendanceRanking } from "@/hooks/use-attendance-ranking";
import { RiskZoneBadge } from "./RiskZoneBadge";
import { ACWR_STALE_THRESHOLD_MS } from "@/lib/workload-constants";

function RankNumber({ rank }: { rank: number }) {
    if (rank === 1) {
        return (
            <span
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-300 text-sm font-bold text-white"
                aria-label="1º lugar"
            >
                1
            </span>
        );
    }
    if (rank === 2) {
        return (
            <span
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-300 text-sm font-bold text-neutral-700"
                aria-label="2º lugar"
            >
                2
            </span>
        );
    }
    if (rank === 3) {
        return (
            <span
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-700/20 text-sm font-bold text-amber-800"
                aria-label="3º lugar"
            >
                3
            </span>
        );
    }
    return (
        <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-sm font-medium text-neutral-400"
            aria-label={`${rank}º lugar`}
        >
            {rank}
        </span>
    );
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 5 }).map((_, i) => (
                <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 last:border-0"
                    aria-hidden="true"
                >
                    <div className="h-7 w-7 rounded-full bg-neutral-200 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5 min-w-0">
                        <div
                            className="h-4 rounded bg-neutral-200 animate-pulse"
                            style={{ width: `${52 + (i * 13) % 35}%` }}
                        />
                        <div className="h-3 w-24 rounded bg-neutral-200 animate-pulse" />
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <div className="h-4 w-8 rounded bg-neutral-200 animate-pulse" />
                        <div className="h-5 w-16 rounded-full bg-neutral-200 animate-pulse" />
                    </div>
                </div>
            ))}
        </>
    );
}

const DAY_OPTIONS = [
    { label: "7d", value: 7, ariaLabel: "Últimos 7 dias" },
    { label: "30d", value: 30, ariaLabel: "Últimos 30 dias" },
    { label: "60d", value: 60, ariaLabel: "Últimos 60 dias" },
] as const;

export function AttendanceRankingWidget() {
    const [days, setDays] = useState<number>(30);

    const { data, isLoading, isError, dataUpdatedAt } = useAttendanceRanking({ days });

    const isAcwrStale =
        data?.acwrLastRefreshedAt != null &&
        dataUpdatedAt > 0 &&
        dataUpdatedAt - new Date(data.acwrLastRefreshedAt).getTime() > ACWR_STALE_THRESHOLD_MS;

    const noAcwrData =
        !isLoading && data != null && data.acwrLastRefreshedAt == null;

    return (
        <section
            aria-labelledby="ranking-heading"
            className="bg-white rounded-lg border border-neutral-200 overflow-hidden"
        >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                <div className="flex items-center gap-2">
                    <Trophy size={16} className="text-accent-400 flex-shrink-0" aria-hidden="true" />
                    <h2
                        id="ranking-heading"
                        className="text-sm font-semibold text-neutral-900"
                    >
                        Ranking de Assiduidade
                    </h2>
                </div>

                <div
                    className="flex items-center gap-1"
                    role="group"
                    aria-label="Selecionar período"
                >
                    {DAY_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDays(opt.value)}
                            className={cn(
                                "h-7 px-2.5 rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                                days === opt.value
                                    ? "bg-primary-500 text-white"
                                    : "text-neutral-500 hover:bg-neutral-100",
                            )}
                            aria-pressed={days === opt.value}
                            aria-label={opt.ariaLabel}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {isAcwrStale && (
                <div
                    role="note"
                    className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs"
                >
                    <Clock size={12} className="flex-shrink-0" aria-hidden="true" />
                    Dados de risco desatualizados — atualização automática a cada 4 horas.
                </div>
            )}

            {noAcwrData && (
                <div
                    role="note"
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-50 border-b border-neutral-100 text-neutral-500 text-xs"
                >
                    <Info size={12} className="flex-shrink-0" aria-hidden="true" />
                    Indicadores de risco disponíveis após o primeiro ciclo de treinos.
                </div>
            )}

            <div role="list" aria-label="Atletas classificados por frequência de sessões">
                {isLoading ? (
                    <SkeletonRows />
                ) : isError ? (
                    <div className="py-12 text-center px-4">
                        <AlertTriangle
                            size={32}
                            className="mx-auto text-neutral-300 mb-2"
                            aria-hidden="true"
                        />
                        <p className="text-sm text-neutral-500 font-medium">
                            Não foi possível carregar o ranking.
                        </p>
                        <p className="text-xs text-neutral-400 mt-1">
                            Verifique sua conexão e tente novamente.
                        </p>
                    </div>
                ) : !data || data.athletes.length === 0 ? (
                    <div className="py-14 text-center px-4">
                        <TrendingUp
                            size={40}
                            className="mx-auto text-neutral-200 mb-3"
                            aria-hidden="true"
                        />
                        <p className="text-sm text-neutral-500 font-medium">
                            Nenhum atleta ativo encontrado.
                        </p>
                        <p className="text-xs text-neutral-400 mt-1 max-w-xs mx-auto leading-relaxed">
                            Registre sessões de treino para ver o ranking de assiduidade.
                        </p>
                    </div>
                ) : (
                    data.athletes.map((athlete, index) => (
                        <div
                            key={athlete.athleteId}
                            role="listitem"
                            className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors"
                        >
                            <RankNumber rank={index + 1} />

                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-neutral-900 truncate">
                                    {athlete.name}
                                </p>
                                <p className="text-xs text-neutral-400 truncate">
                                    {athlete.position ?? "Posição não informada"}
                                </p>
                            </div>

                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <span
                                    className="font-mono text-sm font-bold text-neutral-800 tabular-nums"
                                    aria-label={`${athlete.sessionCount} sessões`}
                                >
                                    {athlete.sessionCount}×
                                </span>
                                <RiskZoneBadge zone={athlete.riskZone} size="sm" />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {data && data.athletes.length > 0 && (
                <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50 text-xs text-neutral-400 flex items-center gap-1.5">
                    <Info size={11} className="flex-shrink-0" aria-hidden="true" />
                    Indicador de risco baseado no ACWR (Carga Aguda:Crônica)
                    {data.acwrLastRefreshedAt != null && (
                        <> — pode ter até 4h de defasagem.</>
                    )}
                    {data.acwrLastRefreshedAt == null && (
                        <> — aguardando primeiro ciclo de dados.</>
                    )}
                </div>
            )}
        </section>
    );
}