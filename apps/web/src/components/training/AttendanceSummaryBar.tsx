"use client";

import { CheckCircle, XCircle, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AttendanceSummaryBarProps {
    presentCount: number;
    absentCount: number;
    pendingCount: number;
    totalCount: number;
    isSaving: boolean;
    savedCount: number | null;
    onSave: () => void;
    onReset: () => void;
    onMarkAllPresent: () => void;
}

function Spinner() {
    return (
        <svg
            className="animate-spin h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
        </svg>
    );
}

export function AttendanceSummaryBar({
    presentCount,
    absentCount,
    pendingCount,
    totalCount,
    isSaving,
    savedCount,
    onSave,
    onReset,
    onMarkAllPresent,
}: AttendanceSummaryBarProps) {
    if (savedCount !== null) {
        return (
            <div
                role="status"
                aria-live="polite"
                className="sticky bottom-0 z-10 bg-primary-50 border-t-2 border-primary-300 px-4 py-4
          flex items-center justify-between gap-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
            >
                <div className="flex items-center gap-2 text-primary-700">
                    <CheckCircle size={18} className="flex-shrink-0" aria-hidden="true" />
                    <p className="text-sm font-semibold">
                        {savedCount} atleta{savedCount !== 1 ? "s" : ""} registrado
                        {savedCount !== 1 ? "s" : ""} com sucesso
                    </p>
                </div>
                <Button variant="secondary" size="sm" onClick={onReset}>
                    Nova chamada
                </Button>
            </div>
        );
    }

    return (
        <div className="sticky bottom-0 z-10 bg-white border-t border-neutral-200 px-4 py-3 space-y-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-4 text-sm">
                <span
                    className="flex items-center gap-1.5 text-primary-600 font-semibold"
                    aria-label={`${presentCount} presentes`}
                >
                    <CheckCircle size={15} aria-hidden="true" />
                    {presentCount}
                </span>
                <span
                    className="flex items-center gap-1.5 text-red-500 font-semibold"
                    aria-label={`${absentCount} ausentes`}
                >
                    <XCircle size={15} aria-hidden="true" />
                    {absentCount}
                </span>
                {pendingCount > 0 && (
                    <span
                        className="flex items-center gap-1.5 text-neutral-400 text-xs"
                        aria-label={`${pendingCount} pendentes`}
                    >
                        <Clock size={14} aria-hidden="true" />
                        {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
                    </span>
                )}
                <span
                    className="ml-auto flex items-center gap-1.5 text-neutral-500 text-xs"
                    aria-label={`${totalCount} atletas no total`}
                >
                    <Users size={14} aria-hidden="true" />
                    {totalCount}
                </span>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={onMarkAllPresent}
                    disabled={isSaving}
                    className="flex-shrink-0"
                >
                    Todos presentes
                </Button>
                <Button
                    className="flex-1"
                    onClick={onSave}
                    disabled={isSaving || presentCount === 0}
                    aria-disabled={presentCount === 0}
                >
                    {isSaving ? (
                        <span className="flex items-center gap-2">
                            <Spinner />
                            Salvando…
                        </span>
                    ) : (
                        `Salvar chamada${presentCount > 0 ? ` (${presentCount})` : ""}`
                    )}
                </Button>
            </div>

            {presentCount === 0 && (
                <p
                    className="text-xs text-neutral-400 text-center"
                    role="note"
                    aria-live="polite"
                >
                    Marque pelo menos 1 atleta como presente para salvar.
                </p>
            )}
        </div>
    );
}