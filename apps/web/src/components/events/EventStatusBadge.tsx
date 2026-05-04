import type { EventStatus } from "@/lib/api/events";
import { cn } from "@/lib/utils";

const CONFIG: Record<EventStatus, { label: string; dot: string; bg: string; text: string }> = {
    SCHEDULED: {
        label: "Agendado",
        dot: "bg-amber-400",
        bg: "bg-amber-50",
        text: "text-amber-700",
    },
    LIVE: {
        label: "Ao vivo",
        dot: "bg-primary-500",
        bg: "bg-primary-50",
        text: "text-primary-700",
    },
    COMPLETED: {
        label: "Encerrado",
        dot: "bg-neutral-400",
        bg: "bg-neutral-100",
        text: "text-neutral-600",
    },
    CANCELLED: {
        label: "Cancelado",
        dot: "bg-danger",
        bg: "bg-red-50",
        text: "text-red-700",
    },
};

interface EventStatusBadgeProps {
    status: EventStatus;
}

export function EventStatusBadge({ status }: EventStatusBadgeProps) {
    const cfg = CONFIG[status];
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                cfg.bg,
                cfg.text,
            )}
            aria-label={`Status: ${cfg.label}`}
        >
            <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", cfg.dot)} aria-hidden="true" />
            {cfg.label}
        </span>
    );
}