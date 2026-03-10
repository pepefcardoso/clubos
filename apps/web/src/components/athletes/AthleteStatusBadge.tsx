import type { AthleteStatus } from "@/lib/api/athletes";

const BADGE_STYLES: Record<AthleteStatus, string> = {
    ACTIVE: "bg-primary-50 text-primary-700",
    INACTIVE: "bg-neutral-100 text-neutral-600",
    SUSPENDED: "bg-orange-50 text-orange-700",
};

const BADGE_LABELS: Record<AthleteStatus, string> = {
    ACTIVE: "Ativo",
    INACTIVE: "Inativo",
    SUSPENDED: "Suspenso",
};

interface AthleteStatusBadgeProps {
    status: AthleteStatus;
}

export function AthleteStatusBadge({ status }: AthleteStatusBadgeProps) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLES[status]}`}
        >
            {BADGE_LABELS[status]}
        </span>
    );
}