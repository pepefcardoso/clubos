"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle, Copy, ExternalLink } from "lucide-react";
import type { ShowcaseTier } from "../../../../../packages/shared-types/src/index.js";
import { useAuth } from "@/hooks/use-auth";
import { useShowcase, usePublishShowcase } from "@/hooks/use-showcase";
import { getAthlete } from "@/lib/api/athletes";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ToastContainer } from "@/components/ui/toast-container";
import { useToasts } from "@/hooks/use-toasts";
import { ShowcaseTierSelector } from "./ShowcaseTierSelector";
import { ShowcaseSnapshotPreview } from "./ShowcaseSnapshotPreview";
import { PublishConfirmModal } from "./PublishConfirmModal";
import { useQueryClient } from "@tanstack/react-query";

interface ShowcaseManagerPageProps {
    athleteId: string;
}

function PageSkeleton() {
    return (
        <div className="space-y-6" aria-hidden="true" aria-busy="true">
            <div className="space-y-1.5">
                <div className="h-6 w-48 rounded bg-neutral-200 animate-pulse" />
                <div className="h-4 w-64 rounded bg-neutral-200 animate-pulse" />
            </div>
            <div className="h-40 rounded-md bg-neutral-200 animate-pulse" />
            <div className="h-24 rounded-md bg-neutral-200 animate-pulse" />
        </div>
    );
}

export function ShowcaseManagerPage({ athleteId }: ShowcaseManagerPageProps) {
    const { user, getAccessToken } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (user && user.role !== "ADMIN") {
            router.replace("/athletes");
        }
    }, [user, router]);

    const [athleteName, setAthleteName] = useState<string>("");
    const [selectedTier, setSelectedTier] = useState<ShowcaseTier | undefined>(undefined);
    const [showModal, setShowModal] = useState(false);
    const [longitudinalError, setLongitudinalError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const { data: showcase, isLoading } = useShowcase(athleteId);
    const { mutate: publish, isPending } = usePublishShowcase(athleteId);
    const { toasts, pushSuccess, pushError } = useToasts();

    const queryClient = useQueryClient();

    useEffect(() => {
        let cancelled = false;
        async function load() {
            const token = await getAccessToken();
            if (!token || cancelled) return;
            try {
                const athlete = await getAthlete(athleteId, token);
                if (!cancelled) setAthleteName(athlete.name);
            } catch {
                // non-critical — name missing degrades gracefully
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [athleteId, getAccessToken]);

    useEffect(() => {
        let es: EventSource | null = null;

        async function open() {
            const token = await getAccessToken();
            if (!token) return;

            es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);

            es.addEventListener("SHOWCASE_UPDATED", (e: MessageEvent) => {
                const data = JSON.parse(e.data) as { athleteId?: string };

                if (data.athleteId === athleteId) {
                    void queryClient.invalidateQueries({
                        queryKey: ["showcase", athleteId],
                    });
                }
            });
        }

        void open();

        return () => {
            es?.close();
        };
    }, [athleteId, getAccessToken, queryClient]);

    const tier = selectedTier ?? showcase?.tier ?? "FREE";

    const hasAcwrData =
        (showcase?.snapshot.acwrTrend.length ?? 0) > 0;

    function handlePublishClick() {
        setLongitudinalError(null);
        setShowModal(true);
    }

    function handleConfirm() {
        publish(tier, {
            onSuccess: () => {
                setShowModal(false);
                pushSuccess(
                    athleteName
                        ? `Showcase de ${athleteName} publicado com sucesso.`
                        : "Showcase publicado com sucesso.",
                );
            },
            onError: (err: unknown) => {
                setShowModal(false);
                const apiErr = err as { status?: number; message?: string };
                if (apiErr.status === 409) {
                    setLongitudinalError(
                        apiErr.message ??
                        "Dados longitudinais insuficientes para publicação PREMIUM.",
                    );
                } else {
                    pushError(
                        apiErr.message ??
                        "Não foi possível publicar o showcase. Tente novamente.",
                    );
                }
            },
        });
    }

    async function handleCopyHash() {
        if (!showcase?.snapshotHash) return;
        try {
            await navigator.clipboard.writeText(showcase.snapshotHash);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            pushError("Não foi possível copiar o hash.");
        }
    }

    if (!user || user.role !== "ADMIN") return null;
    if (isLoading) {
        return (
            <div className="px-6 py-8 max-w-3xl mx-auto">
                <PageSkeleton />
            </div>
        );
    }

    return (
        <div className="px-6 py-8 max-w-3xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                    Showcase do Atleta
                </h1>
                <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                    {athleteName
                        ? `Gerencie a visibilidade de ${athleteName} para scouts.`
                        : "Gerencie a visibilidade do atleta para scouts."}
                </p>
            </div>

            {longitudinalError && (
                <div
                    role="alert"
                    className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-md text-amber-700 text-sm leading-relaxed"
                >
                    <AlertTriangle
                        size={15}
                        className="flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                    />
                    {longitudinalError}
                </div>
            )}

            {showcase?.snapshot ? (
                <section
                    aria-labelledby="snapshot-heading"
                    className="bg-white rounded-md border border-neutral-200 p-6 space-y-4"
                >
                    <div className="flex items-center justify-between">
                        <h2
                            id="snapshot-heading"
                            className="text-sm font-semibold text-neutral-900"
                        >
                            Snapshot atual
                        </h2>
                        {showcase.isPublished && (
                            <span
                                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary-50 text-primary-700"
                                aria-label="Status: Publicado"
                            >
                                <span
                                    className="h-1.5 w-1.5 rounded-full flex-shrink-0 bg-primary-500"
                                    aria-hidden="true"
                                />
                                Publicado
                            </span>
                        )}
                    </div>

                    <ShowcaseSnapshotPreview snapshot={showcase.snapshot} />

                    <div className="pt-2 border-t border-neutral-100">
                        <p className="text-xs text-neutral-500 mb-1.5">
                            Hash do snapshot (SHA-256)
                        </p>
                        <div className="flex items-center gap-2">
                            <code className="font-mono text-xs text-neutral-700 bg-neutral-50 border border-neutral-200 rounded px-2 py-1 flex-1 overflow-x-auto whitespace-nowrap">
                                {showcase.snapshotHash}
                            </code>
                            <button
                                type="button"
                                onClick={handleCopyHash}
                                className="p-1.5 text-neutral-400 hover:text-primary-600 transition-colors rounded flex-shrink-0"
                                aria-label="Copiar hash do snapshot"
                            >
                                {copied ? (
                                    <CheckCircle
                                        size={15}
                                        className="text-primary-600"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <Copy size={15} aria-hidden="true" />
                                )}
                            </button>
                        </div>
                    </div>
                </section>
            ) : (
                <section
                    aria-label="Sem showcase publicado"
                    className="bg-white rounded-md border border-neutral-200 p-6"
                >
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <ExternalLink
                            size={40}
                            className="text-neutral-200 mb-3"
                            aria-hidden="true"
                        />
                        <p className="text-sm font-medium text-neutral-600">
                            Nenhum showcase publicado
                        </p>
                        <p className="text-xs text-neutral-400 mt-1 max-w-xs leading-relaxed">
                            Selecione um tier e publique para tornar este atleta
                            visível para scouts.
                        </p>
                    </div>
                </section>
            )}

            <section
                aria-labelledby="tier-heading"
                className="bg-white rounded-md border border-neutral-200 p-6 space-y-4"
            >
                <h2
                    id="tier-heading"
                    className="text-sm font-semibold text-neutral-900"
                >
                    {showcase ? "Alterar tier" : "Selecionar tier"}
                </h2>

                <ShowcaseTierSelector
                    value={tier}
                    onChange={(t) => {
                        setSelectedTier(t);
                        setLongitudinalError(null);
                    }}
                    hasAcwrData={hasAcwrData}
                    disabled={isPending}
                />

                <div className="flex justify-end pt-2">
                    <Button
                        onClick={handlePublishClick}
                        disabled={isPending}
                        type="button"
                        aria-label={
                            showcase
                                ? "Reeditar showcase com o tier selecionado"
                                : "Publicar showcase com o tier selecionado"
                        }
                    >
                        {isPending ? (
                            <>
                                <Spinner size={14} />
                                Publicando…
                            </>
                        ) : showcase ? (
                            "Reeditar showcase"
                        ) : (
                            "Publicar showcase"
                        )}
                    </Button>
                </div>
            </section>

            {showModal && (
                <PublishConfirmModal
                    athleteName={athleteName}
                    tier={tier}
                    isRePublish={!!showcase}
                    isPending={isPending}
                    onConfirm={handleConfirm}
                    onClose={() => setShowModal(false)}
                />
            )}

            <ToastContainer toasts={toasts} />
        </div>
    );
}