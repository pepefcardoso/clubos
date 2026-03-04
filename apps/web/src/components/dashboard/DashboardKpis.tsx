"use client";

import { Users, UserCheck, UserX, TrendingUp } from "lucide-react";
import { KpiCard } from "./KpiCard";
import { useDashboardSummary } from "@/hooks/use-dashboard";
import { formatBRL } from "@/lib/format";

export function DashboardKpis() {
    const { data, isLoading, isError } = useDashboardSummary();

    if (isError) {
        return (
            <div
                role="alert"
                className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-danger"
            >
                Não foi possível carregar os indicadores. Tente recarregar a página.
            </div>
        );
    }

    if (!isLoading && !data) return null;

    const totalReceivableCents =
        (data?.charges.pendingAmountCents ?? 0) +
        (data?.charges.overdueAmountCents ?? 0);

    const totalReceivableCount =
        (data?.charges.pendingCount ?? 0) + (data?.charges.overdueCount ?? 0);

    const adimplentePct =
        data && data.members.total > 0
            ? Math.round((data.members.active / data.members.total) * 100)
            : null;

    return (
        <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            aria-label="Indicadores do clube"
        >
            <KpiCard
                label="Total de Sócios"
                value={isLoading ? "—" : String(data!.members.total)}
                subtext={isLoading ? undefined : `${data!.members.inactive} inativos`}
                icon={Users}
                variant="default"
                isLoading={isLoading}
            />

            <KpiCard
                label="Adimplentes"
                value={isLoading ? "—" : String(data!.members.active)}
                subtext={adimplentePct !== null ? `${adimplentePct}% do total` : undefined}
                icon={UserCheck}
                variant="success"
                isLoading={isLoading}
            />

            <KpiCard
                label="Inadimplentes"
                value={isLoading ? "—" : String(data!.members.overdue)}
                subtext={
                    isLoading
                        ? undefined
                        : `${data!.charges.overdueCount} cobranç${data!.charges.overdueCount === 1 ? "a" : "as"} em atraso`
                }
                icon={UserX}
                variant="danger"
                isLoading={isLoading}
            />

            <KpiCard
                label="A Receber"
                value={isLoading ? "—" : formatBRL(totalReceivableCents)}
                subtext={
                    isLoading
                        ? undefined
                        : `${totalReceivableCount} cobranç${totalReceivableCount === 1 ? "a" : "as"} pendente${totalReceivableCount === 1 ? "" : "s"}`
                }
                icon={TrendingUp}
                variant="warning"
                isLoading={isLoading}
            />
        </div>
    );
}