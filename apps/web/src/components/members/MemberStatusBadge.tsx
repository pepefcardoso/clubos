import type { MemberStatus } from "../../../../../packages/shared-types/src/index.js";

const STATUS_CONFIG: Record<
    MemberStatus,
    { label: string; className: string }
> = {
    ACTIVE: {
        label: "Adimplente",
        className: "bg-primary-50 text-primary-700",
    },
    INACTIVE: {
        label: "Inativo",
        className: "bg-neutral-100 text-neutral-600",
    },
    OVERDUE: {
        label: "Inadimplente",
        className: "bg-red-50 text-red-700",
    },
};

interface MemberStatusBadgeProps {
    status: MemberStatus;
}

export function MemberStatusBadge({ status }: MemberStatusBadgeProps) {
    const config = STATUS_CONFIG[status];
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
        >
            {config.label}
        </span>
    );
}