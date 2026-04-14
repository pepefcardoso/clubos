"use client";

import { Shield, TrendingUp, AlertTriangle, CalendarCheck } from "lucide-react";
import { useSafDashboard, type ComplianceStatus } from "@/hooks/use-saf-dashboard";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

const COMPLIANCE_CONFIG: Record<
    ComplianceStatus,
    { label: string; description: string; valueClass: string; iconClass: string; accentClass: string }
> = {
    compliant: {
        label: "Em Dia",
        description: "Balanço publicado este ano, sem passivos pendentes",
        valueClass: "text-primary-600",
        iconClass: "text-primary-600",
        accentClass: "bg-primary-500",
    },
    warning: {
        label: "Atenção",
        description: "Balanço publicado, mas há passivos trabalhistas pendentes",
        valueClass: "text-amber-600",
        iconClass: "text-amber-500",
        accentClass: "bg-amber-400",
    },
    irregular: {
        label: "Irregular",
        description: "Nenhum balanço publicado no exercício atual",
        valueClass: "text-red-600",
        iconClass: "text-red-500",
        accentClass: "bg-red-500",
    },
    unknown: {
        label: "—",
        description: "Verificando dados…",
        valueClass: "text-neutral-400",
        iconClass: "text-neutral-300",
        accentClass: "bg-neutral-200",
    },
};

function SkeletonCard() {
    return (
        <div
            className="bg-white border border-neutral-200 rounded-md p-6 space-y-4"
            aria-busy="true"
            aria-label="Carregando indicador"
        >
            <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-neutral-200 animate-pulse flex-shrink-0" />
                <div className="h-3.5 w-28 rounded bg-neutral-200 animate-pulse" />
            </div>
            <div className="h-7 w-32 rounded bg-neutral-200 animate-pulse" />
            <div className="h-3 w-44 rounded bg-neutral-200 animate-pulse" />
        </div>
    );
}

interface KpiCardProps {
    label: string;
    value: string;
    description: string;
    icon: React.ElementType;
    valueClass?: string;
    iconClass?: string;
    accentClass?: string;
}

function KpiCard({
    label,
    value,
    description,
    icon: Icon,
    valueClass = "text-neutral-900",
    iconClass = "text-neutral-500",
    accentClass = "bg-neutral-200",
}: KpiCardProps) {
    return (
        <div className="relative bg-white border border-neutral-200 rounded-md p-6 space-y-3 overflow-hidden transition-shadow hover:shadow-md">
            <div
                className={cn("absolute top-0 left-0 right-0 h-0.5 rounded-t-md", accentClass)}
                aria-hidden="true"
            />
            <div className="flex items-center gap-2.5 pt-1">
                <div className="p-1.5 rounded-md bg-neutral-50 flex-shrink-0">
                    <Icon size={18} className={iconClass} aria-hidden="true" />
                </div>
                <span className="text-sm font-medium text-neutral-500 leading-none">
                    {label}
                </span>
            </div>
            <p
                className={cn(
                    "font-mono text-2xl font-semibold tracking-tight leading-none",
                    valueClass,
                )}
            >
                {value}
            </p>
            <p className="text-xs text-neutral-400 leading-snug">{description}</p>
        </div>
    );
}

interface ComplianceCardProps {
    status: ComplianceStatus;
}

function ComplianceCard({ status }: ComplianceCardProps) {
    const config = COMPLIANCE_CONFIG[status];

    return (
        <div className="relative bg-white border border-neutral-200 rounded-md p-6 space-y-3 overflow-hidden transition-shadow hover:shadow-md">
            <div
                className={cn(
                    "absolute top-0 left-0 right-0 h-0.5 rounded-t-md",
                    config.accentClass,
                )}
                aria-hidden="true"
            />
            <div className="flex items-center gap-2.5 pt-1">
                <div className="p-1.5 rounded-md bg-neutral-50 flex-shrink-0">
                    <Shield size={18} className={config.iconClass} aria-hidden="true" />
                </div>
                <span className="text-sm font-medium text-neutral-500 leading-none">
                    Compliance SAF
                </span>
            </div>
            <p
                className={cn(
                    "text-2xl font-semibold tracking-tight leading-none",
                    config.valueClass,
                )}
            >
                {config.label}
            </p>
            <p className="text-xs text-neutral-400 leading-snug">{config.description}</p>
        </div>
    );
}

/**
 * SafDashboard — KPI header for the SAF compliance page.
 *
 * Displays 4 cards:
 *   1. MRR (current calendar month confirmed payments)
 *   2. Passivos Trabalhistas Pendentes (sum of PENDING creditor disclosures)
 *   3. Compliance SAF (traffic-light derived from balance sheet + pending liabilities)
 *   4. Última Publicação (date of most recent published balance sheet)
 *
 * All data comes from hooks already used by the individual panels below on
 * the page — React Query's cache deduplication means zero extra HTTP requests.
 */
export function SafDashboard() {
    const {
        mrrCents,
        pendingLiabilitiesCents,
        lastPublishedAt,
        complianceStatus,
        isLoading,
    } = useSafDashboard();

    if (isLoading) {
        return (
            <div
                className="grid grid-cols-2 lg:grid-cols-4 gap-4"
                aria-label="Carregando KPIs do dashboard SAF"
            >
                {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonCard key={i} />
                ))}
            </div>
        );
    }

    const lastPublishedFormatted = lastPublishedAt
        ? new Intl.DateTimeFormat("pt-BR").format(new Date(lastPublishedAt))
        : "Nunca publicado";

    const currentMonthLabel = new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
    }).format(new Date());

    return (
        <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            aria-label="Indicadores SAF"
        >
            <KpiCard
                label="Receita Mensal (MRR)"
                value={formatBRL(mrrCents)}
                description={`Pagamentos confirmados em ${currentMonthLabel}`}
                icon={TrendingUp}
                valueClass="text-primary-700"
                iconClass="text-primary-600"
                accentClass="bg-primary-500"
            />

            <KpiCard
                label="Passivos Pendentes"
                value={formatBRL(pendingLiabilitiesCents)}
                description={
                    pendingLiabilitiesCents > 0
                        ? "Passivos trabalhistas aguardando liquidação"
                        : "Nenhum passivo trabalhista pendente"
                }
                icon={AlertTriangle}
                valueClass={
                    pendingLiabilitiesCents > 0 ? "text-amber-600" : "text-neutral-900"
                }
                iconClass={
                    pendingLiabilitiesCents > 0 ? "text-amber-500" : "text-neutral-400"
                }
                accentClass={
                    pendingLiabilitiesCents > 0 ? "bg-amber-400" : "bg-neutral-200"
                }
            />

            <ComplianceCard status={complianceStatus} />

            <KpiCard
                label="Última Publicação"
                value={lastPublishedFormatted}
                description={
                    lastPublishedAt
                        ? "Balanço patrimonial publicado (Lei 14.193/2021)"
                        : "Nenhum balanço publicado ainda"
                }
                icon={CalendarCheck}
                valueClass={lastPublishedAt ? "text-neutral-900" : "text-neutral-400"}
                iconClass={lastPublishedAt ? "text-neutral-500" : "text-neutral-300"}
                accentClass="bg-neutral-200"
            />
        </div>
    );
}