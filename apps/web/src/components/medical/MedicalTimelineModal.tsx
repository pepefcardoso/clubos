"use client";

import { useEffect } from "react";
import { X, History } from "lucide-react";
import { MedicalTimeline } from "./MedicalTimeline";

interface MedicalTimelineModalProps {
    athleteId: string;
    athleteName: string;
    onClose: () => void;
}

/**
 * Modal wrapper for `MedicalTimeline`.
 *
 * Handles:
 *   - Body scroll lock while open
 *   - Keyboard Escape to dismiss
 *   - Backdrop click to dismiss
 *   - ARIA dialog attributes for screen-reader accessibility
 */
export function MedicalTimelineModal({
    athleteId,
    athleteName,
    onClose,
}: MedicalTimelineModalProps) {
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="timeline-modal-title"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="relative w-full max-w-lg mx-4 bg-white rounded-lg shadow-lg overflow-hidden max-h-[80dvh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <History
                            size={16}
                            className="text-primary-600 flex-shrink-0"
                            aria-hidden="true"
                        />
                        <div>
                            <h2
                                id="timeline-modal-title"
                                className="text-base font-semibold text-neutral-900 leading-tight"
                            >
                                Histórico Clínico
                            </h2>
                            <p className="text-xs text-neutral-500 mt-0.5">{athleteName}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ml-4 flex-shrink-0"
                        aria-label="Fechar histórico clínico"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <div className="flex gap-4 px-5 py-2 border-b border-neutral-100 bg-neutral-50 flex-shrink-0">
                    {[
                        { dot: "bg-danger", label: "Lesão" },
                        { dot: "bg-accent-300", label: "Status RTP" },
                        { dot: "bg-info", label: "Avaliação" },
                    ].map(({ dot, label }) => (
                        <span
                            key={label}
                            className="flex items-center gap-1.5 text-xs text-neutral-500"
                        >
                            <span
                                className={`h-2 w-2 rounded-full flex-shrink-0 ${dot}`}
                                aria-hidden="true"
                            />
                            {label}
                        </span>
                    ))}
                </div>

                <div className="overflow-y-auto flex-1">
                    <MedicalTimeline athleteId={athleteId} />
                </div>
            </div>
        </div>
    );
}