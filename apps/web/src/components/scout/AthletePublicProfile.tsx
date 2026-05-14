"use client";

import { useState } from "react";
import { Lock, Video, Star, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import type { ScoutAthleteProfile, ScoutVideoItem } from "../../../../../packages/shared-types/src";
import { AcwrMiniChart } from "./ShowcaseSnapshotPreview";
import Image from "next/image";

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

function SnapshotHashRow({ hash }: { hash: string }) {
    const [copied, setCopied] = useState(false);

    function handleCopy() {
        void navigator.clipboard.writeText(hash).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    return (
        <div className="flex items-center gap-2 rounded border border-neutral-200 bg-neutral-50 px-3 py-2">
            <span className="text-[10px] text-neutral-500 flex-shrink-0">SHA-256</span>
            <span
                className="font-mono text-[10px] text-neutral-700 truncate flex-1"
                title="Verifique a integridade do perfil com SHA-256"
            >
                {hash}
            </span>
            <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? "Hash copiado" : "Copiar hash SHA-256"}
                className="flex-shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors"
            >
                {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
            </button>
        </div>
    );
}

function VideoGallery({ videos }: { videos: ScoutVideoItem[] }) {
    if (videos.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 py-8 rounded border border-neutral-100 bg-neutral-50">
                <Video size={32} className="text-neutral-300" aria-hidden="true" />
                <p className="text-sm font-medium text-neutral-600">Nenhum vídeo publicado</p>
                <p className="text-xs text-neutral-500">O clube ainda não adicionou vídeos a este perfil.</p>
            </div>
        );
    }

    return (
        <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            role="list"
            aria-label={`${videos.length} vídeo${videos.length !== 1 ? "s" : ""} do atleta`}
        >
            {videos.map((v) => (
                <div
                    key={v.id}
                    role="listitem"
                    className="relative aspect-video rounded-md border border-neutral-200 bg-neutral-100 overflow-hidden"
                >
                    {v.thumbnailUrl ? (
                        <Image
                            src={v.thumbnailUrl}
                            alt={`Miniatura do vídeo ${v.order + 1}`}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 50vw, 33vw"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <Video size={20} className="text-neutral-300" aria-hidden="true" />
                        </div>
                    )}
                    {v.durationSeconds > 0 && (
                        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
                            {Math.floor(v.durationSeconds / 60)}:{String(v.durationSeconds % 60).padStart(2, "0")}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}

function VideoGalleryGate() {
    return (
        <div className="relative">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden="true">
                {[...Array(3)].map((_, i) => (
                    <div
                        key={i}
                        className="aspect-video rounded-md border border-neutral-200 bg-neutral-100 blur-[3px]"
                    />
                ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-white/70 backdrop-blur-[1px]">
                <Lock size={16} className="text-neutral-500" aria-hidden="true" />
                <p className="text-xs font-medium text-neutral-700">
                    Vídeos disponíveis apenas para assinantes Premium
                </p>
                <a
                    href="/scout/billing"
                    aria-label="Assinar Premium para ver os vídeos deste atleta"
                    className="inline-flex items-center gap-1 rounded bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors"
                >
                    <span className="font-mono">{formatBRL(29900)}</span>
                    <span className="font-normal opacity-80">/mês</span>
                </a>
            </div>
        </div >
    );
}

function ScoreDot({ value }: { value: number }) {
    return (
        <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden" role="presentation">
            <div
                className="h-full rounded-full bg-primary-400"
                style={{ width: `${(value / 10) * 100}%` }}
            />
        </div>
    );
}

interface AthletePublicProfileProps {
    profile: ScoutAthleteProfile;
    /** T-172: pass true once contact request exists; always false until T-172 ships */
    hasPendingRequest?: boolean;
}

export function AthletePublicProfile({
    profile,
    hasPendingRequest = false,
}: AthletePublicProfileProps) {
    const isGated = profile.upgrade_required;

    const builtAt = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(profile.snapshotBuiltAt));

    return (
        <div className="space-y-6 max-w-2xl mx-auto">

            <div className="flex items-start gap-4">
                <div
                    className="h-14 w-14 flex-shrink-0 rounded-full bg-primary-100 flex items-center justify-center"
                    aria-hidden="true"
                >
                    <span className="text-lg font-bold text-primary-700">{profile.nameInitials}</span>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-neutral-800">{profile.nameInitials}</span>
                        {profile.tier === "PREMIUM" ? (
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
                    <p className="text-xs text-neutral-500">
                        {profile.position ?? "Posição não definida"} · {profile.ageYears} anos
                        {profile.state ? ` · ${profile.state}` : ""}
                    </p>
                    <RtpBadge status={profile.rtpStatus} />
                </div>
            </div>

            <SnapshotHashRow hash={profile.snapshotHash} />
            <p className="text-[10px] text-neutral-400 -mt-4">
                Snapshot gerado em {builtAt}
            </p>

            <section aria-labelledby="acwr-heading">
                <h2
                    id="acwr-heading"
                    className="text-xs font-medium text-neutral-500 mb-2"
                >
                    Curva de Carga (ACWR)
                </h2>
                {isGated ? (
                    <div className="relative h-[140px] rounded border border-neutral-100 bg-neutral-50 overflow-hidden">
                        <div className="h-full w-full blur-[4px] pointer-events-none" aria-hidden="true" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                            <Lock size={14} className="text-neutral-400" aria-hidden="true" />
                            <p className="text-xs text-neutral-500">Disponível no plano Premium</p>
                        </div>
                    </div>
                ) : profile.acwrTrend != null ? (
                    <AcwrMiniChart trend={profile.acwrTrend} />
                ) : (
                    <div className="flex items-center justify-center h-[140px] rounded bg-neutral-50 border border-neutral-100">
                        <p className="text-xs text-neutral-400">Sem dados de ACWR para este período.</p>
                    </div>
                )}
            </section>

            <section aria-labelledby="scores-heading">
                <h2
                    id="scores-heading"
                    className="text-xs font-medium text-neutral-500 mb-2"
                >
                    Avaliações técnicas
                </h2>
                {isGated ? (
                    <div className="space-y-1.5" aria-hidden="true">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="w-12 h-2.5 rounded bg-neutral-100 blur-[2px]" />
                                <div className="flex-1 h-1.5 rounded-full bg-neutral-100" />
                                <span className="w-6 h-2.5 rounded bg-neutral-100 blur-[2px]" />
                            </div>
                        ))}
                    </div>
                ) : profile.evaluationScores != null ? (
                    <>
                        {(
                            [
                                ["technique", "Técnica"],
                                ["tactical", "Tático"],
                                ["physical", "Físico"],
                                ["mental", "Mental"],
                                ["attitude", "Atitude"],
                            ] as const
                        ).map(([key, label]) => (
                            <div key={key} className="flex items-center gap-2 mb-1.5">
                                <span className="w-12 text-[10px] text-neutral-500 flex-shrink-0">{label}</span>
                                <ScoreDot value={profile.evaluationScores![key]} />
                                <span className="font-mono text-[10px] text-neutral-600 w-6 text-right flex-shrink-0">
                                    {profile.evaluationScores![key]}
                                </span>
                            </div>
                        ))}
                    </>
                ) : (
                    <p className="text-xs text-neutral-400">Sem avaliações registradas.</p>
                )}
            </section>

            <section aria-labelledby="videos-heading">
                <h2
                    id="videos-heading"
                    className="text-xs font-medium text-neutral-500 mb-2"
                >
                    Vídeos
                    {profile.videoCount != null && !isGated && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                            <Video size={8} aria-hidden="true" />
                            {profile.videoCount}
                        </span>
                    )}
                </h2>
                {isGated || profile.videos === null ? (
                    <VideoGalleryGate />
                ) : (
                    <VideoGallery videos={profile.videos} />
                )}
            </section>

            <div className="pt-2 border-t border-neutral-100">
                <button
                    type="button"
                    disabled={hasPendingRequest}
                    aria-label={
                        hasPendingRequest
                            ? "Já existe uma solicitação pendente para este atleta"
                            : `Solicitar contato com atleta ${profile.nameInitials}`
                    }
                    className={cn(
                        "w-full rounded bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors",
                        "hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                >
                    {hasPendingRequest ? "Solicitação pendente" : "Solicitar contato"}
                </button>
                {/* TODO: [T-172] wire onClick to contact request flow */}
            </div>
        </div>
    );
}