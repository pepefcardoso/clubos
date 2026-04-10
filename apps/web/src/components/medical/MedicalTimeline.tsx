"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMedicalRecords } from "@/hooks/use-medical-records";
import { useEvaluations } from "@/hooks/use-evaluations";
import { useAthleteRtp } from "@/hooks/use-rtp";
import {
    GRADE_BADGE,
    MECHANISM_LABEL,
    RTP_BADGE,
    EVENT_DOT,
    EVENT_LABEL,
} from "./timeline-config";
import type {
    ClinicalEvent,
    InjuryEvent,
    RtpEvent,
    EvaluationEvent,
} from "./timeline-types";
import type { InjuryGrade } from "@/lib/api/medical-records";

function EventDetail({ event }: { event: ClinicalEvent }) {
    if (event.type === "injury") {
        const grade = GRADE_BADGE[event.grade as InjuryGrade];
        return (
            <div className="space-y-1">
                <p className="text-sm font-semibold text-neutral-800">
                    {event.structure}
                </p>
                <div className="flex flex-wrap gap-1.5 items-center">
                    {grade && (
                        <span
                            className={cn(
                                "text-xs font-medium rounded-full px-2 py-0.5",
                                grade.bg,
                                grade.text,
                            )}
                        >
                            {grade.label}
                        </span>
                    )}
                    <span className="text-xs text-neutral-500">
                        {MECHANISM_LABEL[event.mechanism] ?? event.mechanism}
                    </span>
                </div>
            </div>
        );
    }

    if (event.type === "rtp") {
        const cfg = RTP_BADGE[event.status] ?? RTP_BADGE["AFASTADO"];
        return (
            <div className="flex items-center gap-2 flex-wrap">
                <span
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border border-current/20",
                        cfg.bg,
                        cfg.text,
                    )}
                >
                    <span
                        className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", cfg.dot)}
                        aria-hidden="true"
                    />
                    {cfg.label}
                </span>
                {event.notes && (
                    <span className="text-xs text-neutral-500 truncate max-w-[200px]">
                        {event.notes}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-700">
                {event.microcycle}
            </span>
            <span className="font-mono text-sm font-bold text-info">
                {event.averageScore.toFixed(1)}
            </span>
        </div>
    );
}

function TimelineEventRow({
    event,
    isLast,
}: {
    event: ClinicalEvent;
    isLast: boolean;
}) {
    const dotClass = EVENT_DOT[event.type] ?? "bg-neutral-400";

    const formattedDate = new Intl.DateTimeFormat("pt-BR").format(
        new Date(event.date),
    );

    return (
        <div className="flex gap-3" role="listitem">
            <div className="flex flex-col items-center w-5 flex-shrink-0">
                <div
                    className={cn(
                        "mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 z-10",
                        dotClass,
                    )}
                    aria-hidden="true"
                />
                {!isLast && (
                    <div className="w-px flex-1 bg-neutral-200 mt-1" aria-hidden="true" />
                )}
            </div>

            <div className={cn("min-w-0 flex-1", isLast ? "pb-1" : "pb-4")}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-neutral-400">
                        {formattedDate}
                    </span>
                    <span className="text-[0.6875rem] font-medium text-neutral-500">
                        {EVENT_LABEL[event.type]}
                    </span>
                </div>
                <EventDetail event={event} />
            </div>
        </div>
    );
}

function TimelineSkeleton() {
    return (
        <div
            className="space-y-0 px-4 py-3"
            aria-hidden="true"
            aria-busy="true"
            aria-label="Carregando histórico clínico"
        >
            {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center w-5 flex-shrink-0">
                        <div
                            className="mt-1.5 h-2.5 w-2.5 rounded-full bg-neutral-200 animate-pulse flex-shrink-0"
                            style={{ animationDelay: `${i * 80}ms` }}
                        />
                        {i < 3 && (
                            <div className="w-px flex-1 bg-neutral-100 mt-1" />
                        )}
                    </div>
                    <div className="flex-1 pb-4 space-y-1.5">
                        <div
                            className="h-3 w-24 rounded bg-neutral-200 animate-pulse"
                            style={{ animationDelay: `${i * 80}ms` }}
                        />
                        <div
                            className="h-4 rounded bg-neutral-200 animate-pulse"
                            style={{
                                width: `${50 + (i * 17) % 35}%`,
                                animationDelay: `${i * 80 + 40}ms`,
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

interface MedicalTimelineProps {
    athleteId: string;
}

/**
 * Chronological list of clinical events for a given athlete.
 *
 * Fetches from three sources in parallel:
 *   - `GET /api/medical-records` — injury summaries (no clinical field decrypt)
 *   - `GET /api/athletes/:id/rtp` — current RTP status (one event at updatedAt)
 *   - `GET /api/evaluations` — technical evaluation scores
 *
 * Events are normalised to `ClinicalEvent` and sorted newest-first.
 * The component is read-only; callers must gate access with
 * `canAccessClinicalData(user?.role)` before mounting.
 */
export function MedicalTimeline({ athleteId }: MedicalTimelineProps) {
    const { data: medicalData, isLoading: loadingMedical } = useMedicalRecords({
        athleteId,
        limit: 50,
    });

    const { data: evalData, isLoading: loadingEval } = useEvaluations({
        athleteId,
        limit: 50,
    });

    const { data: rtpData, isLoading: loadingRtp } = useAthleteRtp(athleteId);

    const isLoading = loadingMedical || loadingEval || loadingRtp;

    const events = useMemo<ClinicalEvent[]>(() => {
        const result: ClinicalEvent[] = [];

        for (const r of medicalData?.data ?? []) {
            result.push({
                id: r.id,
                date: r.occurredAt,
                type: "injury",
                structure: r.structure,
                grade: r.grade,
                mechanism: r.mechanism,
            } satisfies InjuryEvent);
        }

        if (rtpData?.status && rtpData.updatedAt) {
            result.push({
                id: `rtp-${athleteId}`,
                date: rtpData.updatedAt.slice(0, 10),
                type: "rtp",
                status: rtpData.status,
                notes: rtpData.notes ?? null,
            } satisfies RtpEvent);
        }

        for (const e of evalData?.data ?? []) {
            result.push({
                id: e.id,
                date: e.date,
                type: "evaluation",
                microcycle: e.microcycle,
                averageScore: e.averageScore,
            } satisfies EvaluationEvent);
        }

        return result.sort((a, b) => b.date.localeCompare(a.date));
    }, [medicalData, evalData, rtpData, athleteId]);

    if (isLoading) return <TimelineSkeleton />;

    if (events.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Activity
                    size={40}
                    className="text-neutral-200 mb-3"
                    aria-hidden="true"
                />
                <p className="text-sm font-medium text-neutral-500">
                    Nenhum evento clínico registrado
                </p>
                <p className="text-xs text-neutral-400 mt-1">
                    Lesões, avaliações e status de RTP aparecerão aqui.
                </p>
            </div>
        );
    }

    return (
        <div
            role="list"
            aria-label="Linha do tempo de eventos clínicos"
            className="px-4 py-3"
        >
            {events.map((event, idx) => (
                <TimelineEventRow
                    key={`${event.type}-${event.id}`}
                    event={event}
                    isLast={idx === events.length - 1}
                />
            ))}
        </div>
    );
}