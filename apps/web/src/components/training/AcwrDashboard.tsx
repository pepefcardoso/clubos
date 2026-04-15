"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Clock, Info, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAthleteAcwr } from "@/hooks/use-athlete-acwr";
import { useAttendanceRanking } from "@/hooks/use-attendance-ranking";
import { RiskZoneBadge } from "./RiskZoneBadge";
import { AcwrRiskChart } from "./AcwrRiskChart";
import type { RiskZone } from "@/lib/api/workload";
import { ACWR_STALE_THRESHOLD_MS } from "@/lib/workload-constants";

const DAY_OPTIONS = [
    { label: "14d", value: 14, ariaLabel: "Últimos 14 dias" },
    { label: "28d", value: 28, ariaLabel: "Últimos 28 dias" },
    { label: "60d", value: 60, ariaLabel: "Últimos 60 dias" },
] as const;

/**
 * Returns a human-readable interpretation of the ACWR ratio for coaches.
 * Handles the insufficient_data case gracefully.
 */
function getRatioInterpretation(
    ratio: number | null,
    zone: RiskZone | null,
): string {
    if (ratio === null || zone === null || zone === "insufficient_data") {
        return "Dados insuficientes para calcular o índice. São necessários pelo menos 28 dias de registros de treino.";
    }

    const fmt = ratio.toFixed(2);

    switch (zone) {
        case "low":
            return `Índice ${fmt} — Carga abaixo do ideal. Considere aumentar o volume ou a intensidade dos treinos.`;
        case "optimal":
            return `Índice ${fmt} — Zona ótima. Atleta em condições ideais de treino e competição.`;
        case "high":
            return `Índice ${fmt} — Carga elevada. Monitore de perto; evite sessões de alta intensidade nos próximos dias.`;
        case "very_high":
            return `Índice ${fmt} — Risco elevado de lesão. Recomendado reduzir a carga imediatamente e avaliar o atleta.`;
    }
}

function DashboardSkeleton() {
    return (
        <div className="space-y-4" aria-hidden="true" aria-busy="true">
            <div className="flex gap-3 items-center">
                <div className="h-9 w-44 bg-neutral-200 rounded animate-pulse" />
            </div>
            <div className="h-7 w-28 bg-neutral-200 rounded-full animate-pulse" />
            <div className="space-y-1.5">
                <div className="h-3.5 w-full bg-neutral-200 rounded animate-pulse" />
                <div className="h-3.5 w-2/3 bg-neutral-200 rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-3 gap-2">
                {[...Array(3)].map((_, i) => (
                    <div
                        key={i}
                        className="h-16 bg-neutral-200 rounded animate-pulse"
                        style={{ animationDelay: `${i * 80}ms` }}
                    />
                ))}
            </div>
            <div className="h-[220px] bg-neutral-200 rounded animate-pulse" />
        </div>
    );
}

interface MetricCardProps {
    label: string;
    value: number | null;
    unit?: string;
    highlight?: boolean;
}

function MetricCard({ label, value, unit, highlight }: MetricCardProps) {
    return (
        <div
            role="listitem"
            className={cn(
                "rounded-md border p-3 text-center",
                highlight
                    ? "border-primary-200 bg-primary-50"
                    : "border-neutral-200 bg-white",
            )}
        >
            <p className="text-[0.6875rem] text-neutral-500 mb-1 leading-tight">
                {label}
            </p>
            <p
                className={cn(
                    "font-mono font-bold tabular-nums leading-tight",
                    highlight
                        ? "text-primary-700 text-lg"
                        : "text-neutral-800 text-base",
                )}
            >
                {value !== null ? value.toLocaleString("pt-BR") : "—"}
                {value !== null && unit && (
                    <span className="text-xs font-normal ml-0.5 text-neutral-400">
                        {unit}
                    </span>
                )}
            </p>
        </div>
    );
}

export function AcwrDashboard() {
    const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
    const [days, setDays] = useState<number>(28);

    const { data: rankingData, isLoading: isLoadingAthletes } =
        useAttendanceRanking({ days: 30 });

    const athletes = rankingData?.athletes ?? [];

    const {
        data: acwrData,
        isLoading: isLoadingAcwr,
        isError: isAcwrError,
        dataUpdatedAt,
    } = useAthleteAcwr({
        athleteId: selectedAthleteId,
        days,
        enabled: !!selectedAthleteId,
    });

    const latest = acwrData?.latest ?? null;
    const history = acwrData?.history ?? [];

    const isDataStale = useMemo(() => {
        return (
            latest !== null &&
            dataUpdatedAt > 0 &&
            dataUpdatedAt - new Date(latest.date).getTime() > ACWR_STALE_THRESHOLD_MS
        );
    }, [latest, dataUpdatedAt]);

    const selectedAthlete = athletes.find(
        (a) => a.athleteId === selectedAthleteId,
    );

    return (
        <section
            aria-labelledby="acwr-dashboard-heading"
            className="bg-white rounded-lg border border-neutral-200 overflow-hidden"
        >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                <div className="flex items-center gap-2">
                    <Activity
                        size={16}
                        className="text-primary-600 flex-shrink-0"
                        aria-hidden="true"
                    />
                    <h2
                        id="acwr-dashboard-heading"
                        className="text-sm font-semibold text-neutral-900"
                    >
                        Dashboard de Risco ACWR
                    </h2>
                </div>

                <div
                    className="flex items-center gap-1"
                    role="group"
                    aria-label="Selecionar período de análise"
                >
                    {DAY_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDays(opt.value)}
                            className={cn(
                                "h-7 px-2.5 rounded text-xs font-medium transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
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

            <div className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                    <label
                        htmlFor="acwr-athlete-select"
                        className="text-xs font-medium text-neutral-500 whitespace-nowrap flex-shrink-0"
                    >
                        Atleta
                    </label>
                    <select
                        id="acwr-athlete-select"
                        value={selectedAthleteId ?? ""}
                        onChange={(e) =>
                            setSelectedAthleteId(e.target.value || null)
                        }
                        disabled={isLoadingAthletes}
                        className={cn(
                            "flex-1 h-9 rounded border border-neutral-300 bg-white px-3",
                            "text-[0.9375rem] text-neutral-900 transition-colors",
                            "focus-visible:outline-none focus-visible:border-primary-500",
                            "focus-visible:ring-2 focus-visible:ring-primary-500/20",
                            "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
                        )}
                        aria-label="Selecionar atleta para análise de risco ACWR"
                    >
                        <option value="">
                            {isLoadingAthletes
                                ? "Carregando atletas…"
                                : "Selecione um atleta…"}
                        </option>
                        {athletes.map((athlete) => (
                            <option
                                key={athlete.athleteId}
                                value={athlete.athleteId}
                            >
                                {athlete.name}
                                {athlete.position ? ` — ${athlete.position}` : ""}
                            </option>
                        ))}
                    </select>
                </div>

                {!selectedAthleteId && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <TrendingUp
                            size={40}
                            className="text-neutral-200 mb-3"
                            aria-hidden="true"
                        />
                        <p className="text-sm text-neutral-500 font-medium">
                            Selecione um atleta para visualizar o risco de lesão
                        </p>
                        <p className="text-xs text-neutral-400 mt-1.5 max-w-xs leading-relaxed">
                            O índice ACWR compara a carga aguda (7 dias) com a
                            carga crônica (28 dias) para estimar o risco de lesão
                            por excesso de treino.
                        </p>
                    </div>
                )}

                {selectedAthleteId && isLoadingAcwr && <DashboardSkeleton />}

                {selectedAthleteId && isAcwrError && (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <AlertTriangle
                            size={32}
                            className="text-neutral-300 mb-2"
                            aria-hidden="true"
                        />
                        <p className="text-sm text-neutral-500 font-medium">
                            Não foi possível carregar os dados de risco.
                        </p>
                        <p className="text-xs text-neutral-400 mt-1">
                            Verifique sua conexão e tente novamente.
                        </p>
                    </div>
                )}

                {selectedAthleteId &&
                    !isLoadingAcwr &&
                    !isAcwrError &&
                    acwrData && (
                        <>
                            {isDataStale && (
                                <div
                                    role="note"
                                    className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded text-amber-700 text-xs"
                                >
                                    <Clock
                                        size={12}
                                        className="flex-shrink-0"
                                        aria-hidden="true"
                                    />
                                    Dados podem ter até 4h de defasagem —
                                    atualização automática em andamento.
                                </div>
                            )}

                            <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 mt-0.5">
                                    <RiskZoneBadge
                                        zone={latest?.riskZone ?? null}
                                        size="lg"
                                    />
                                </div>
                                <p className="text-xs text-neutral-500 leading-relaxed">
                                    {getRatioInterpretation(
                                        latest?.acwrRatio ?? null,
                                        latest?.riskZone ?? null,
                                    )}
                                </p>
                            </div>

                            <div
                                className="grid grid-cols-3 gap-2"
                                role="list"
                                aria-label="Métricas de carga atual"
                            >
                                <MetricCard
                                    label="ACWR"
                                    value={
                                        latest?.acwrRatio != null
                                            ? parseFloat(
                                                latest.acwrRatio.toFixed(2),
                                            )
                                            : null
                                    }
                                    highlight
                                />
                                <MetricCard
                                    label="Carga aguda (7d)"
                                    value={latest?.acuteLoadAu ?? null}
                                    unit="AU"
                                />
                                <MetricCard
                                    label="Carga crônica (28d)"
                                    value={
                                        latest?.chronicLoadAu != null
                                            ? Math.round(latest.chronicLoadAu)
                                            : null
                                    }
                                    unit="AU"
                                />
                            </div>

                            {history.length > 0 ? (
                                <div>
                                    <p className="text-xs font-medium text-neutral-500 mb-2">
                                        Evolução — últimos {days} dias
                                    </p>
                                    <AcwrRiskChart history={history} />
                                </div>
                            ) : (
                                <div
                                    role="note"
                                    className="flex items-center gap-2 px-3 py-3 bg-neutral-50 border border-neutral-100 rounded text-neutral-500 text-xs"
                                >
                                    <Info
                                        size={12}
                                        className="flex-shrink-0"
                                        aria-hidden="true"
                                    />
                                    Sem histórico disponível para o período
                                    selecionado.
                                    {selectedAthlete && (
                                        <>
                                            {" "}
                                            Registre sessões de treino para{" "}
                                            {selectedAthlete.name}.
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}
            </div>

            <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50 text-[0.65rem] text-neutral-400 flex items-center gap-1.5">
                <Info size={10} className="flex-shrink-0" aria-hidden="true" />
                ACWR = Carga Aguda (7d) ÷ Carga Crônica (28d). Zona ótima:
                0.8–1.3. Dados atualizados a cada 4h.
            </div>
        </section>
    );
}