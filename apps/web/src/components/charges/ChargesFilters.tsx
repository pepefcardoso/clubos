"use client";

import { Input } from "@/components/ui/input";
import type { ChargeStatus } from "@/lib/api/charges";

type ChargeStatusFilter = ChargeStatus | "";

const STATUS_OPTIONS: Array<{ value: ChargeStatusFilter; label: string }> = [
    { value: "", label: "Todos os status" },
    { value: "PENDING", label: "Pendente" },
    { value: "PAID", label: "Pago" },
    { value: "OVERDUE", label: "Vencido" },
    { value: "PENDING_RETRY", label: "Retentativa" },
    { value: "CANCELLED", label: "Cancelado" },
];

interface ChargesFiltersProps {
    month: string;
    status: ChargeStatusFilter;
    onMonthChange: (v: string) => void;
    onStatusChange: (v: ChargeStatusFilter) => void;
}

export function ChargesFilters({
    month,
    status,
    onMonthChange,
    onStatusChange,
}: ChargesFiltersProps) {
    return (
        <div className="flex flex-wrap gap-3 items-center">
            <Input
                type="month"
                value={month}
                onChange={(e) => onMonthChange(e.target.value)}
                className="w-44"
                aria-label="Filtrar por mês"
            />
            <select
                value={status}
                onChange={(e) => onStatusChange(e.target.value as ChargeStatusFilter)}
                className="h-9 w-44 rounded border border-neutral-300 bg-white px-3 py-1
          text-[0.9375rem] text-neutral-900 transition-colors
          focus-visible:outline-none focus-visible:border-primary-500
          focus-visible:ring-2 focus-visible:ring-primary-500/20
          disabled:cursor-not-allowed disabled:bg-neutral-50"
                aria-label="Filtrar por status"
            >
                {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}