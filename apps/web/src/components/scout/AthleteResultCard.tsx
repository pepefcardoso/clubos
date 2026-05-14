"use client";

import { Lock, Video, Star } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ScoutAthleteResult } from "../../../../../packages/shared-types/src";

const RTP_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    AFASTADO: { label: "Afastado", bg: "bg-red-50", text: "text-red-700", dot: "bg-danger" },
    RETORNO_PROGRESSIVO: {
        label: "Retorno Progressivo",
        bg: "bg-amber-50",
        text: "text-amber-700",
        dot: "bg-amber-400",
    },
    LIBERADO: { label: "Liberado", bg: "bg-primary-50", text: "text-primary-700", dot: "bg-primary-500" },
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
                className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", cfg?.dot ?? "bg-neutral-400")}
                aria-hidden="true"
            />
            {label}
        </span>
    );
}

function GatedValue({ fallback }: { fallback?: React.ReactNode }) {
    return (
        <span
            className="inline-block select-none"
            aria-label="Conteúdo disponível apenas para assinantes Premium"
        >
            <span className="blur-[4px] pointer-events-none font-mono text-neutral-400" aria-hidden="true">
                {fallback ?? "████"}
            </span>
        </span>
    );
}

function ScoreDot({ value }: { value: number }) {
    const pct = (value / 10) * 100;
    return (
        <div
            className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden"
            role="presentation"
        >
            <div
                className="h-full rounded-full bg-primary-400"
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}

interface AthleteResultCardProps {
    result: ScoutAthleteResult;
}

export function AthleteResultCard({ result }: AthleteResultCardProps) {
    const isGated = result.upgrade_required;
    const avgScore =
        result.evaluationScores != null
            ? Object.values(result.evaluationScores).reduce((a, b) => a + b, 0) / 5
            : null;

    const lastAcwr =
        result.acwrTrend != null && result.acwrTrend.length > 0
            ? result.acwrTrend[result.acwrTrend.length - 1]?.acwrRatio
            : null;

    return (
        <article
            className={cn(
                "relative rounded-md border bg-white shadow-sm transition-shadow hover:shadow-md overflow-hidden flex flex-col",
                isGated ? "border-neutral-200" : "border-primary-100",
            )}
            aria-label={`Atleta ${result.nameInitials}${result.position ? `, ${result.position}` : ""}`}
        >
            <div className="absolute top-3 right-3">
                {result.tier === "PREMIUM" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 border border-accent-200 px-2 py-0.5 text-[10px] font-semibold text-accent-500 uppercase tracking-wide">
                        <Star size={9} aria-hidden="true" />
                        Premium
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500 uppercase tracking-wide">
                        Free
                    </span>
                )}
            </div>

            <div className="p-5 flex flex-col gap-4 flex-1">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                        <div
                            className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0"
                            aria-hidden="true"
                        >
                            <span className="text-sm font-bold text-primary-700">{result.nameInitials}</span>
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-neutral-800 truncate">
                                {result.nameInitials}
                            </p>
                            <p className="text-xs text-neutral-500">
                                {result.position ?? "Posição não definida"} · {result.ageYears} anos
                                {result.state ? ` · ${result.state}` : ""}
                            </p>
                        </div>
                    </div>
                    <RtpBadge status={result.rtpStatus} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded border border-neutral-100 bg-neutral-50 p-2">
                        <p className="text-[10px] text-neutral-500 mb-0.5">ACWR</p>
                        {isGated ? (
                            <GatedValue fallback="0.00" />
                        ) : (
                            <p className="font-mono text-sm font-semibold text-neutral-800">
                                {lastAcwr != null ? lastAcwr.toFixed(2) : "—"}
                            </p>
                        )}
                    </div>

                    <div className="rounded border border-neutral-100 bg-neutral-50 p-2">
                        <p className="text-[10px] text-neutral-500 mb-0.5">Score</p>
                        {isGated ? (
                            <GatedValue fallback="0.0" />
                        ) : (
                            <p className="font-mono text-sm font-semibold text-neutral-800">
                                {avgScore != null ? avgScore.toFixed(1) : "—"}
                            </p>
                        )}
                    </div>

                    <div className="rounded border border-neutral-100 bg-neutral-50 p-2">
                        <p className="text-[10px] text-neutral-500 mb-0.5 flex items-center justify-center gap-0.5">
                            <Video size={9} aria-hidden="true" /> Vídeos
                        </p>
                        {isGated ? (
                            <GatedValue fallback="00" />
                        ) : (
                            <p className="font-mono text-sm font-semibold text-neutral-800">
                                {result.videoCount ?? "—"}
                            </p>
                        )}
                    </div>
                </div>

                {!isGated && result.evaluationScores != null ? (
                    <div className="space-y-1.5">
                        {(
                            [
                                ["technique", "Téc."],
                                ["tactical", "Tát."],
                                ["physical", "Fís."],
                                ["mental", "Ment."],
                                ["attitude", "Atit."],
                            ] as const
                        ).map(([key, label]) => (
                            <div key={key} className="flex items-center gap-2">
                                <span className="w-8 text-[10px] text-neutral-500 flex-shrink-0">{label}</span>
                                <ScoreDot value={result.evaluationScores![key]} />
                                <span className="font-mono text-[10px] text-neutral-600 w-6 text-right flex-shrink-0">
                                    {result.evaluationScores![key]}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : isGated ? (
                    <div className="space-y-1.5" aria-hidden="true">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="w-8 h-2.5 rounded bg-neutral-100 blur-[2px]" />
                                <div className="flex-1 h-1.5 rounded-full bg-neutral-100" />
                                <span className="w-6 h-2.5 rounded bg-neutral-100 blur-[2px]" />
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            {isGated && (
                <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                        <Lock size={11} aria-hidden="true" />
                        Dados Premium
                    </div>
                    <a
                        href="/scout/billing"
                        aria-label="Assinar Premium por R$ 299,00 por mês para ver dados completos"
                        className="inline-flex items-center gap-1 rounded bg-primary-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors"
                        aria-disabled="true"
                        tabIndex={0}
                    >
                        <span className="font-mono">{formatBRL(29900)}</span>
                        <span className="font-normal opacity-80">/mês</span>
                    </a>
                </div>
            )}
        </article>
    );
}