"use client";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
} from "recharts";
import type { ShowcaseSnapshot } from "../../../../../packages/shared-types/src/index.js";
import { cn } from "@/lib/utils";

const RTP_CONFIG: Record<
    string,
    { label: string; bg: string; text: string; dot: string }
> = {
    AFASTADO: {
        label: "Afastado",
        bg: "bg-red-50",
        text: "text-red-700",
        dot: "bg-danger",
    },
    RETORNO_PROGRESSIVO: {
        label: "Retorno Progressivo",
        bg: "bg-amber-50",
        text: "text-amber-700",
        dot: "bg-amber-400",
    },
    LIBERADO: {
        label: "Liberado",
        bg: "bg-primary-50",
        text: "text-primary-700",
        dot: "bg-primary-500",
    },
};

function RtpBadge({ status }: { status: string | null }) {
    const cfg = status ? RTP_CONFIG[status] : null;
    const label = cfg?.label ?? "Sem RTP";

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                cfg ? `${cfg.bg} ${cfg.text}` : "bg-neutral-100 text-neutral-600",
            )}
            aria-label={`Status RTP: ${label}`}
        >
            <span
                className={cn(
                    "h-1.5 w-1.5 rounded-full flex-shrink-0",
                    cfg?.dot ?? "bg-neutral-400",
                )}
                aria-hidden="true"
            />
            {label}
        </span>
    );
}

interface TooltipItem {
    name: string;
    value: number | null;
    color: string;
}

function AcwrTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: TooltipItem[];
    label?: string;
}) {
    if (!active || !payload?.length) return null;

    return (
        <div className="bg-white border border-neutral-200 rounded shadow-md p-2.5 text-xs min-w-[130px]">
            <p className="font-semibold text-neutral-700 mb-1.5 pb-1 border-b border-neutral-100">
                {label}
            </p>
            {payload.map((entry) => (
                <div
                    key={entry.name}
                    className="flex items-center justify-between gap-3 py-0.5"
                >
                    <span className="flex items-center gap-1.5 text-neutral-500">
                        <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: entry.color }}
                        />
                        {entry.name}
                    </span>
                    <span className="font-mono font-semibold text-neutral-800 tabular-nums">
                        {entry.value != null ? entry.value.toFixed(2) : "—"}
                    </span>
                </div>
            ))}
        </div>
    );
}

export function AcwrMiniChart({
    trend,
}: {
    trend: ShowcaseSnapshot["acwrTrend"];
}) {
    if (trend.length === 0) {
        return (
            <div className="flex items-center justify-center h-[140px] rounded bg-neutral-50 border border-neutral-100">
                <p className="text-xs text-neutral-400">
                    Sem dados de ACWR para este período.
                </p>
            </div>
        );
    }

    const data = trend.map((e) => ({
        date: e.date.slice(5),
        acwr: e.acwrRatio,
    }));

    return (
        <ResponsiveContainer width="100%" height={140}>
            <LineChart
                data={data}
                margin={{ top: 4, right: 16, bottom: 0, left: -28 }}
            >
                <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e8e6e0"
                    vertical={false}
                />
                <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "#78746a" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                />
                <YAxis
                    tick={{ fontSize: 9, fill: "#78746a" }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 2.5]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                />
                <Tooltip content={<AcwrTooltip />} cursor={{ stroke: "#d1cec6", strokeWidth: 1 }} />
                <ReferenceLine
                    y={0.8}
                    stroke="#2471a3"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                />
                <ReferenceLine
                    y={1.3}
                    stroke="#d4940a"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                />
                <Line
                    type="monotone"
                    dataKey="acwr"
                    name="ACWR"
                    stroke="#c0392b"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls={false}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}

const SCORE_LABELS: Record<
    keyof NonNullable<ShowcaseSnapshot["evaluationScores"]>,
    string
> = {
    technique: "Técnica",
    tactical: "Tático",
    physical: "Físico",
    mental: "Mental",
    attitude: "Atitude",
};

export function EvaluationScoreGrid({
    scores,
}: {
    scores: ShowcaseSnapshot["evaluationScores"];
}) {
    const keys = Object.keys(SCORE_LABELS) as Array<
        keyof NonNullable<ShowcaseSnapshot["evaluationScores"]>
    >;

    return (
        <div
            className="grid grid-cols-5 gap-2"
            role="list"
            aria-label="Avaliações técnicas"
        >
            {keys.map((key) => {
                const value = scores?.[key] ?? null;
                return (
                    <div
                        key={key}
                        role="listitem"
                        className="flex flex-col items-center gap-1 rounded-md border border-neutral-200 bg-white p-2.5 text-center"
                    >
                        <span className="text-[0.6rem] text-neutral-500 leading-tight">
                            {SCORE_LABELS[key]}
                        </span>
                        <span className="font-mono font-bold text-neutral-800 text-sm tabular-nums">
                            {value != null ? value : "—"}
                        </span>
                        {value != null && (
                            <span className="text-[0.6rem] text-neutral-400">/ 10</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

interface ShowcaseSnapshotPreviewProps {
    snapshot: ShowcaseSnapshot;
}

export function ShowcaseSnapshotPreview({
    snapshot,
}: ShowcaseSnapshotPreviewProps) {
    const builtAt = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(snapshot.snapshotBuiltAt));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <p className="text-xs font-medium text-neutral-500">
                        Snapshot gerado em {builtAt}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-neutral-500">
                            {snapshot.position ?? "Posição não definida"} ·{" "}
                            {snapshot.ageYears} anos
                            {snapshot.dominantFoot
                                ? ` · Pé ${snapshot.dominantFoot.toLowerCase()}`
                                : ""}
                        </span>
                        <RtpBadge status={snapshot.rtpStatus} />
                    </div>
                </div>
            </div>

            <div>
                <p className="text-xs font-medium text-neutral-500 mb-2">
                    ACWR — últimos {snapshot.acwrTrend.length} registros
                </p>
                <AcwrMiniChart trend={snapshot.acwrTrend} />
            </div>

            <div>
                <p className="text-xs font-medium text-neutral-500 mb-2">
                    Avaliações técnicas
                </p>
                <EvaluationScoreGrid scores={snapshot.evaluationScores} />
            </div>
        </div>
    );
}