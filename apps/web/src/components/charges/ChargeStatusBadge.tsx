import type { ChargeStatus } from "@/lib/api/charges";

const STATUS_CONFIG: Record<ChargeStatus, { label: string; className: string }> =
{
    PENDING: {
        label: "Pendente",
        className: "bg-amber-50 text-amber-700",
    },
    PAID: {
        label: "Pago",
        className: "bg-primary-50 text-primary-700",
    },
    OVERDUE: {
        label: "Vencido",
        className: "bg-red-50 text-red-700",
    },
    CANCELLED: {
        label: "Cancelado",
        className: "bg-neutral-100 text-neutral-500 line-through",
    },
    PENDING_RETRY: {
        label: "Retentativa",
        className: "bg-orange-50 text-orange-700",
    },
};

interface ChargeStatusBadgeProps {
    status: ChargeStatus;
}

export function ChargeStatusBadge({ status }: ChargeStatusBadgeProps) {
    const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
        >
            {config.label}
        </span>
    );
}