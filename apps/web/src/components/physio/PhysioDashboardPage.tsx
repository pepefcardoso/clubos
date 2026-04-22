"use client";

import { useState } from "react";
import {
    Stethoscope,
    Info,
    AlertTriangle,
    ShieldCheck,
    Building2,
    Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { canAccessClinicalData } from "@/lib/role-utils";
import { AtRiskAthletesPanel } from "@/components/medical/AtRiskAthletesPanel";
import { InjuryLoadCorrelationPanel } from "@/components/medical/InjuryLoadCorrelationPanel";
import { ClubSwitcher } from "./ClubSwitcher";
import { usePhysioClubs, useMultiClubDashboard } from "@/hooks/use-physio-clubs";
import { RiskZoneBadge } from "@/components/training/RiskZoneBadge";
import type { RiskZone } from "@/lib/api/workload";

const ACWR_THRESHOLDS = [
    { label: "≥ 1.3", value: 1.3 },
    { label: "≥ 1.5", value: 1.5 },
    { label: "≥ 2.0", value: 2.0 },
] as const;

/**
 * Consolidated multi-club at-risk panel (shown in "Visão Consolidada" mode).
 * Fans out across all clubs via GET /api/physio/dashboard.
 */
function ConsolidatedAtRiskPanel({ minAcwr }: { minAcwr: number }) {
    const { data, isLoading, isError } = useMultiClubDashboard(minAcwr);

    if (isLoading) {
        return (
            <div className="bg-white rounded-lg border border-neutral-200 p-6">
                <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                        <div
                            key={i}
                            className="h-12 rounded bg-neutral-100 animate-pulse"
                            style={{ animationDelay: `${i * 80}ms` }}
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="bg-white rounded-lg border border-neutral-200 p-8 text-center">
                <AlertTriangle size={28} className="mx-auto text-neutral-300 mb-2" />
                <p className="text-sm text-neutral-500">Não foi possível carregar os dados consolidados.</p>
            </div>
        );
    }

    const athletes = data?.athletes ?? [];

    return (
        <section
            aria-labelledby="consolidated-heading"
            className="bg-white rounded-lg border border-neutral-200 overflow-hidden"
        >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                <div className="flex items-center gap-2">
                    <Globe size={16} className="text-primary-600" aria-hidden />
                    <h2
                        id="consolidated-heading"
                        className="text-sm font-semibold text-neutral-900"
                    >
                        Atletas em Risco — Todos os Clubes
                    </h2>
                </div>
                {data && (
                    <span className="text-xs text-neutral-400">
                        {data.clubCount} clube{data.clubCount !== 1 ? "s" : ""} analisado
                        {data.clubCount !== 1 ? "s" : ""}
                    </span>
                )}
            </div>

            {athletes.length === 0 ? (
                <div className="py-12 text-center px-4">
                    <ShieldCheck size={36} className="mx-auto text-primary-300 mb-3" aria-hidden />
                    <p className="text-sm font-semibold text-neutral-700">
                        Nenhum atleta em zona de risco
                    </p>
                    <p className="text-xs text-neutral-400 mt-1.5 max-w-xs mx-auto leading-relaxed">
                        ACWR abaixo de {minAcwr} em todos os clubes vinculados.
                    </p>
                </div>
            ) : (
                <div role="list" aria-label="Atletas com ACWR elevado — visão consolidada">
                    {athletes.map((athlete, index) => (
                        <div
                            key={`${athlete.clubId}-${athlete.athleteId}`}
                            role="listitem"
                            className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors"
                        >
                            <span
                                className={cn(
                                    "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                    index === 0 ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-500",
                                )}
                                aria-hidden
                            >
                                {index + 1}
                            </span>

                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-neutral-900 truncate">
                                    {athlete.athleteName}
                                </p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs text-neutral-400 truncate">
                                        {athlete.position ?? "Posição não informada"}
                                    </span>
                                    <span className="flex items-center gap-1 text-[0.65rem] font-medium text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                        <Building2 size={9} aria-hidden />
                                        {athlete.clubName}
                                    </span>
                                    {athlete.lastInjuryStructure && (
                                        <span className="text-xs text-amber-600 font-medium truncate">
                                            Últ. lesão: {athlete.lastInjuryStructure}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <span
                                    className="font-mono text-sm font-bold text-red-700 tabular-nums"
                                    aria-label={`ACWR ${athlete.currentAcwr.toFixed(2)}`}
                                >
                                    {athlete.currentAcwr.toFixed(2)}
                                </span>
                                <RiskZoneBadge zone={athlete.currentRiskZone as RiskZone} size="sm" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="px-4 py-2 border-t border-neutral-100 bg-neutral-50 text-[0.65rem] text-neutral-400 flex items-center gap-1.5">
                <Info size={10} className="flex-shrink-0" aria-hidden />
                Visão consolidada de {data?.clubCount ?? "…"} clube(s). ACWR atualizado a cada 4h.
            </div>
        </section>
    );
}

/**
 * PhysioDashboardPage — multi-club consolidation view for PHYSIO users.
 *
 * Modes:
 *   - "Clube Ativo" (default): shows standard single-club AtRiskAthletesPanel +
 *     InjuryLoadCorrelationPanel for the JWT's current clubId.
 *   - "Visão Consolidada": shows ConsolidatedAtRiskPanel (fans out across all clubs).
 *
 * The ClubSwitcher is rendered in the header for PHYSIO users with > 1 club.
 * Consolidated mode is only available when the PHYSIO has > 1 club.
 */
export function PhysioDashboardPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [consolidated, setConsolidated] = useState(false);
    const [minAcwr, setMinAcwr] = useState(1.3);

    const { data: clubs } = usePhysioClubs();
    const hasMultipleClubs = (clubs?.length ?? 0) > 1;

    useEffect(() => {
        if (user && !canAccessClinicalData(user.role)) {
            router.replace("/dashboard");
        }
    }, [user, router]);

    if (!user || !canAccessClinicalData(user.role)) return null;

    return (
        <div className="px-6 py-8 max-w-7xl mx-auto">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Stethoscope size={20} className="text-primary-600" aria-hidden />
                        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                            Saúde dos Atletas
                        </h1>
                    </div>
                    <p className="text-neutral-500 text-[0.9375rem]">
                        Monitoramento de risco por sobrecarga (ACWR) e histórico clínico.
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <ClubSwitcher />

                    {hasMultipleClubs && (
                        <div
                            className="flex items-center rounded-md border border-neutral-200 bg-white overflow-hidden"
                            role="group"
                            aria-label="Modo de visualização"
                        >
                            <button
                                type="button"
                                onClick={() => setConsolidated(false)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium transition-colors",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                                    !consolidated
                                        ? "bg-primary-500 text-white"
                                        : "text-neutral-600 hover:bg-neutral-50",
                                )}
                                aria-pressed={!consolidated}
                            >
                                Clube Ativo
                            </button>
                            <button
                                type="button"
                                onClick={() => setConsolidated(true)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium transition-colors",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                                    consolidated
                                        ? "bg-primary-500 text-white"
                                        : "text-neutral-600 hover:bg-neutral-50",
                                )}
                                aria-pressed={consolidated}
                            >
                                Visão Consolidada
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-start gap-3 px-4 py-3 mb-6 bg-primary-50 border border-primary-100 rounded-lg">
                <Info size={16} className="text-primary-600 flex-shrink-0 mt-0.5" aria-hidden />
                <p className="text-xs text-primary-700 leading-relaxed">
                    <strong>O que é o ACWR?</strong> O Índice de Carga Aguda:Crônica compara a carga dos
                    últimos 7 dias com a média das últimas 4 semanas. Valores entre 0,8 e 1,3 indicam zona
                    ótima. Acima de 1,3 há risco aumentado de lesão — acima de 1,5 o risco é elevado. Dados
                    atualizados a cada 4 horas.
                </p>
            </div>

            {consolidated && hasMultipleClubs ? (
                <div className="space-y-4">
                    <div className="flex items-center gap-2" role="group" aria-label="Limiar ACWR mínimo">
                        <span className="text-xs text-neutral-500 font-medium">Limiar:</span>
                        {ACWR_THRESHOLDS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setMinAcwr(opt.value)}
                                className={cn(
                                    "h-7 px-3 rounded text-xs font-medium transition-colors",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                                    minAcwr === opt.value
                                        ? "bg-neutral-800 text-white"
                                        : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50",
                                )}
                                aria-pressed={minAcwr === opt.value}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    <ConsolidatedAtRiskPanel minAcwr={minAcwr} />
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-1">
                        <AtRiskAthletesPanel minAcwr={1.3} />
                    </div>
                    <div className="xl:col-span-2">
                        <InjuryLoadCorrelationPanel />
                    </div>
                </div>
            )}
        </div>
    );
}