"use client";

import { useRef, useState } from "react";
import { Check, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/hooks/use-attendance-session";

const SWIPE_THRESHOLD = 40;

const NEXT_STATUS: Record<AttendanceStatus, AttendanceStatus> = {
    pending: "present",
    present: "absent",
    absent: "pending",
};

const STATUS_RING: Record<AttendanceStatus, string> = {
    pending: "bg-white border-neutral-200",
    present: "bg-primary-50 border-primary-300",
    absent: "bg-red-50 border-red-200",
};

const STATUS_TEXT: Record<AttendanceStatus, string> = {
    pending: "text-neutral-700",
    present: "text-primary-800",
    absent: "text-red-700",
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
    pending: "Pendente",
    present: "Presente",
    absent: "Ausente",
};

function StatusIcon({ status }: { status: AttendanceStatus }) {
    if (status === "present") {
        return (
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary-100 border border-primary-200">
                <Check size={20} className="text-primary-600" aria-hidden="true" />
            </div>
        );
    }
    if (status === "absent") {
        return (
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-100 border border-red-200">
                <X size={20} className="text-red-500" aria-hidden="true" />
            </div>
        );
    }
    return (
        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-100 border border-neutral-200">
            <Clock size={18} className="text-neutral-400" aria-hidden="true" />
        </div>
    );
}

interface AthleteRollCardProps {
    athleteId: string;
    name: string;
    status: AttendanceStatus;
    onStatusChange: (athleteId: string, status: AttendanceStatus) => void;
    disabled?: boolean;
}

export function AthleteRollCard({
    athleteId,
    name,
    status,
    onStatusChange,
    disabled,
}: AthleteRollCardProps) {
    const touchStartX = useRef<number | null>(null);
    const [swipeDelta, setSwipeDelta] = useState(0);
    const [isPressed, setIsPressed] = useState(false);

    const advance = () => {
        if (!disabled) onStatusChange(athleteId, NEXT_STATUS[status]);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
        setIsPressed(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const delta = (e.touches[0]?.clientX ?? 0) - touchStartX.current;
        setSwipeDelta(Math.max(-90, Math.min(90, delta)));
    };

    const handleTouchEnd = () => {
        if (Math.abs(swipeDelta) >= SWIPE_THRESHOLD && !disabled) {
            onStatusChange(athleteId, swipeDelta > 0 ? "present" : "absent");
        }
        touchStartX.current = null;
        setSwipeDelta(0);
        setIsPressed(false);
    };

    const handleTouchCancel = () => {
        touchStartX.current = null;
        setSwipeDelta(0);
        setIsPressed(false);
    };

    const isSwipingRight = swipeDelta > 10;
    const isSwipingLeft = swipeDelta < -10;

    return (
        <div
            role="listitem"
            className={cn(
                "relative flex items-center justify-between",
                "h-16 px-4 rounded-lg border-2 select-none overflow-hidden",
                STATUS_RING[status],
                disabled
                    ? "opacity-60 cursor-not-allowed"
                    : "cursor-pointer",
                isPressed && !disabled && "scale-[0.98]",
                "transition-colors duration-100",
            )}
            style={{
                transform: `translateX(${swipeDelta}px) ${isPressed && !disabled && swipeDelta === 0 ? "scale(0.98)" : ""}`,
                transition:
                    swipeDelta === 0
                        ? "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.1s"
                        : "none",
            }}
            onClick={advance}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            aria-label={`${name} — ${STATUS_LABEL[status]}.${!disabled ? " Toque para alterar." : ""}`}
        >
            {isSwipingRight && (
                <div
                    className="absolute inset-0 bg-primary-100 pointer-events-none"
                    style={{ opacity: Math.min(0.6, swipeDelta / 90) }}
                    aria-hidden="true"
                />
            )}
            {isSwipingLeft && (
                <div
                    className="absolute inset-0 bg-red-100 pointer-events-none"
                    style={{ opacity: Math.min(0.6, Math.abs(swipeDelta) / 90) }}
                    aria-hidden="true"
                />
            )}

            {isSwipingRight && (
                <div
                    className="absolute left-3 flex items-center gap-1 text-primary-600 font-semibold text-xs pointer-events-none"
                    style={{ opacity: Math.min(1, (swipeDelta - 10) / 30) }}
                    aria-hidden="true"
                >
                    <Check size={14} />
                    Presente
                </div>
            )}
            {isSwipingLeft && (
                <div
                    className="absolute right-3 flex items-center gap-1 text-red-500 font-semibold text-xs pointer-events-none"
                    style={{ opacity: Math.min(1, (Math.abs(swipeDelta) - 10) / 30) }}
                    aria-hidden="true"
                >
                    Ausente
                    <X size={14} />
                </div>
            )}

            <span
                className={cn(
                    "font-semibold text-[0.9375rem] truncate pr-3 relative z-10",
                    STATUS_TEXT[status],
                )}
            >
                {name}
            </span>

            <div className="flex items-center gap-2 flex-shrink-0 relative z-10">
                <span
                    className={cn(
                        "text-xs font-medium hidden sm:block",
                        STATUS_TEXT[status],
                    )}
                >
                    {STATUS_LABEL[status]}
                </span>
                <StatusIcon status={status} />
            </div>
        </div>
    );
}