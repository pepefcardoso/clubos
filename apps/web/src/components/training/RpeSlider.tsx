"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

const RPE_LABELS: Record<number, string> = {
    1: "Repouso",
    2: "Muito leve",
    3: "Leve",
    4: "Moderado",
    5: "Moderado+",
    6: "Intenso",
    7: "Muito intenso",
    8: "Muito intenso+",
    9: "Quase máximo",
    10: "Máximo",
};

function getSegmentBgClass(n: number, active: boolean): string {
    if (!active) return "bg-neutral-200";
    if (n <= 3) return "bg-primary-400";
    if (n <= 6) return "bg-accent-300";
    if (n <= 8) return "bg-orange-400";
    return "bg-red-600";
}

function getTextColor(n: number): string {
    if (n <= 3) return "text-primary-600";
    if (n <= 6) return "text-amber-600";
    if (n <= 8) return "text-orange-600";
    return "text-red-700";
}

interface RpeSliderProps {
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    id?: string;
}

export function RpeSlider({ value, onChange, disabled, id }: RpeSliderProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    function valueFromPointerX(clientX: number): number {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return value;
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return Math.max(1, Math.min(10, Math.round(pct * 9) + 1));
    }

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (disabled) return;
        isDragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(valueFromPointerX(e.clientX));
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!isDragging.current || disabled) return;
        onChange(valueFromPointerX(e.clientX));
    }

    function handlePointerUp() {
        isDragging.current = false;
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        if (disabled) return;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(Math.min(10, value + 1));
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(Math.max(1, value - 1));
        }
    }

    return (
        <div className="flex flex-col gap-1.5">
            <div
                ref={containerRef}
                id={id}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-valuenow={value}
                aria-valuemin={1}
                aria-valuemax={10}
                aria-label={`RPE ${value} de 10 — ${RPE_LABELS[value]}`}
                aria-disabled={disabled}
                className={cn(
                    "flex gap-0.5 h-10 cursor-pointer select-none rounded touch-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
                    disabled && "opacity-50 pointer-events-none cursor-not-allowed",
                )}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={handleKeyDown}
            >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                    const active = n <= value;
                    const isCurrent = n === value;
                    return (
                        <div
                            key={n}
                            className={cn(
                                "flex-1 flex items-end justify-center pb-0.5 rounded-sm",
                                "transition-all duration-100",
                                getSegmentBgClass(n, active),
                                isCurrent ? "h-full" : active ? "h-4/5" : "h-3/5",
                            )}
                        >
                            {(n === 1 || n === 5 || n === 10) && (
                                <span
                                    className={cn(
                                        "text-[0.5rem] font-bold leading-none",
                                        active ? "text-white/80" : "text-neutral-400",
                                    )}
                                    aria-hidden="true"
                                >
                                    {n}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-400">Leve</span>
                <span className={cn("font-semibold tabular-nums", getTextColor(value))}>
                    RPE {value} — {RPE_LABELS[value]}
                </span>
                <span className="text-neutral-400">Máximo</span>
            </div>
        </div>
    );
}