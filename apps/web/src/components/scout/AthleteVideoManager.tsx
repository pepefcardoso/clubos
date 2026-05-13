"use client";

import { useRef, useState } from "react";
import { Trash2, Upload, GripVertical, Film } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useVideos, useDeleteVideo, useReorderVideos, videosQueryKey } from "@/hooks/use-videos";
import { useAuth } from "@/hooks/use-auth";
import { uploadVideo, type VideoResponse } from "@/lib/api/videos";
import { useToasts } from "@/hooks/use-toasts";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ToastContainer } from "@/components/ui/toast-container";
import { cn } from "@/lib/utils";

const MAX_VIDEOS = 5;

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

interface DeleteModalProps {
    isPending: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

function DeleteModal({ isPending, onConfirm, onClose }: DeleteModalProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-video-title"
        >
            <div className="bg-white rounded-lg shadow-lg w-full max-w-sm mx-4 p-6 space-y-4">
                <h2
                    id="delete-video-title"
                    className="text-base font-semibold text-neutral-900"
                >
                    Remover vídeo
                </h2>
                <p className="text-sm text-neutral-600">
                    Essa ação não pode ser desfeita. O vídeo será removido permanentemente.
                </p>
                <div className="flex justify-end gap-3 pt-2">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onClose}
                        disabled={isPending}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        variant="danger"
                        onClick={onConfirm}
                        disabled={isPending}
                    >
                        {isPending ? (
                            <>
                                <Spinner size={14} />
                                Removendo…
                            </>
                        ) : (
                            "Remover vídeo"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function VideoGridSkeleton() {
    return (
        <div
            className="grid grid-cols-2 sm:grid-cols-3 gap-3"
            aria-hidden="true"
            aria-busy="true"
        >
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    className="aspect-video rounded-md bg-neutral-200 animate-pulse"
                />
            ))}
        </div>
    );
}

interface AthleteVideoManagerProps {
    athleteId: string;
}

export function AthleteVideoManager({ athleteId }: AthleteVideoManagerProps) {
    const { getAccessToken } = useAuth();
    const { data: videos = [], isLoading } = useVideos(athleteId);
    const { mutate: doDelete, isPending: isDeleting } = useDeleteVideo(athleteId);
    const { mutate: doReorder } = useReorderVideos(athleteId);
    const { toasts, pushSuccess, pushError } = useToasts();
    const qc = useQueryClient();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    const atLimit = videos.length >= MAX_VIDEOS;
    const uploadBusy = uploadProgress !== null;

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        const token = await getAccessToken();
        if (!token) {
            pushError("Sessão expirada. Recarregue a página.");
            return;
        }

        setUploadProgress(0);
        try {
            await uploadVideo(athleteId, file, token, setUploadProgress);
            await qc.invalidateQueries({ queryKey: videosQueryKey(athleteId) });
            pushSuccess("Vídeo adicionado com sucesso.");
        } catch (err) {
            const msg =
                (err as { message?: string }).message ??
                "Não foi possível enviar o vídeo. Tente novamente.";
            pushError(msg);
        } finally {
            setUploadProgress(null);
        }
    }

    function handleDeleteConfirm() {
        if (!deleteTargetId) return;
        const prev = qc.getQueryData<VideoResponse[]>(videosQueryKey(athleteId));
        qc.setQueryData<VideoResponse[]>(
            videosQueryKey(athleteId),
            (prev ?? []).filter((v) => v.id !== deleteTargetId),
        );
        doDelete(deleteTargetId, {
            onError: () => {
                qc.setQueryData(videosQueryKey(athleteId), prev);
                pushError("Não foi possível remover o vídeo. Tente novamente.");
            },
            onSuccess: () => pushSuccess("Vídeo removido."),
        });
        setDeleteTargetId(null);
    }

    function handleDragStart(id: string) {
        setDraggedId(id);
    }

    function handleDragOver(e: React.DragEvent, id: string) {
        e.preventDefault();
        if (id !== draggedId) setDragOverId(id);
    }

    function handleDrop(targetId: string) {
        if (!draggedId || draggedId === targetId) {
            resetDrag();
            return;
        }
        const reordered = [...videos];
        const fromIdx = reordered.findIndex((v) => v.id === draggedId);
        const toIdx = reordered.findIndex((v) => v.id === targetId);
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        const prev = qc.getQueryData<VideoResponse[]>(videosQueryKey(athleteId));
        qc.setQueryData(videosQueryKey(athleteId), reordered);
        doReorder(reordered.map((v) => v.id), {
            onError: () => qc.setQueryData(videosQueryKey(athleteId), prev),
        });
        resetDrag();
    }

    function resetDrag() {
        setDraggedId(null);
        setDragOverId(null);
    }

    return (
        <section
            aria-labelledby="video-manager-heading"
            className="bg-white rounded-md border border-neutral-200 p-6 space-y-4"
        >
            <div className="flex items-center justify-between">
                <h2
                    id="video-manager-heading"
                    className="text-sm font-semibold text-neutral-900"
                >
                    Vídeos do showcase
                </h2>
                <span
                    className="rounded-full bg-neutral-100 text-neutral-600 text-xs font-medium px-2.5 py-0.5"
                    aria-label={`${videos.length} de ${MAX_VIDEOS} vídeos adicionados`}
                >
                    {videos.length}/{MAX_VIDEOS} vídeos
                </span>
            </div>

            {uploadBusy && (
                <div
                    role="status"
                    aria-live="polite"
                    aria-label={`Enviando vídeo: ${uploadProgress}%`}
                    className="space-y-1"
                >
                    <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                        <div
                            className="h-full bg-primary-500 transition-all duration-150"
                            style={{ width: `${uploadProgress}%` }}
                        />
                    </div>
                    <p className="text-xs text-neutral-500">
                        Enviando… {uploadProgress}%
                    </p>
                </div>
            )}

            {isLoading ? (
                <VideoGridSkeleton />
            ) : videos.length > 0 ? (
                <div
                    className="grid grid-cols-2 sm:grid-cols-3 gap-3"
                    role="list"
                    aria-label="Vídeos do atleta — arraste para reordenar"
                >
                    {videos.map((video) => (
                        <div
                            key={video.id}
                            role="listitem"
                            draggable
                            onDragStart={() => handleDragStart(video.id)}
                            onDragOver={(e) => handleDragOver(e, video.id)}
                            onDrop={() => handleDrop(video.id)}
                            onDragEnd={resetDrag}
                            className={cn(
                                "relative rounded-md border overflow-hidden bg-neutral-50 aspect-video",
                                "cursor-grab active:cursor-grabbing transition-all",
                                dragOverId === video.id
                                    ? "ring-2 ring-primary-500 border-transparent"
                                    : "border-neutral-200",
                                draggedId === video.id ? "opacity-40" : "opacity-100",
                            )}
                            aria-label={`Vídeo com duração ${formatDuration(video.durationSeconds)}`}
                        >
                            {video.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={video.thumbnailUrl}
                                    alt=""
                                    aria-hidden="true"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Film
                                        size={24}
                                        className="text-neutral-300"
                                        aria-hidden="true"
                                    />
                                </div>
                            )}

                            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 text-white text-[0.6rem] font-mono px-1.5 py-0.5 tabular-nums">
                                {formatDuration(video.durationSeconds)}
                            </span>

                            <span className="absolute bottom-1.5 right-8 pointer-events-none">
                                <GripVertical
                                    size={12}
                                    className="text-white/60"
                                    aria-hidden="true"
                                />
                            </span>

                            <button
                                type="button"
                                onClick={() => setDeleteTargetId(video.id)}
                                disabled={isDeleting || uploadBusy}
                                className={cn(
                                    "absolute top-1.5 right-1.5 p-1 rounded bg-black/50 text-white",
                                    "hover:bg-danger transition-colors",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                                    "disabled:opacity-40 disabled:cursor-not-allowed",
                                )}
                                aria-label="Remover vídeo"
                            >
                                <Trash2 size={12} aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center rounded-md border border-dashed border-neutral-200">
                    <Film
                        size={40}
                        className="text-neutral-200 mb-3"
                        aria-hidden="true"
                    />
                    <p className="text-sm font-medium text-neutral-600">
                        Nenhum vídeo adicionado
                    </p>
                    <p className="text-xs text-neutral-400 mt-1 max-w-xs leading-relaxed">
                        Adicione até {MAX_VIDEOS} vídeos MP4 ou WebM (máx. 90 s por vídeo).
                    </p>
                </div>
            )}

            <div className="flex items-center gap-3 pt-1">
                <input
                    ref={fileInputRef}
                    id="video-file-input"
                    type="file"
                    accept="video/mp4,video/webm"
                    className="sr-only"
                    aria-label="Selecionar vídeo para upload"
                    onChange={handleFileChange}
                    disabled={atLimit || uploadBusy}
                />
                <div className="relative group">
                    <Button
                        type="button"
                        variant="secondary"
                        disabled={atLimit || uploadBusy}
                        onClick={() => fileInputRef.current?.click()}
                        aria-label={
                            atLimit
                                ? `Limite de ${MAX_VIDEOS} vídeos atingido`
                                : "Adicionar vídeo"
                        }
                        aria-disabled={atLimit}
                    >
                        {uploadBusy ? (
                            <>
                                <Spinner size={14} />
                                Enviando…
                            </>
                        ) : (
                            <>
                                <Upload size={14} aria-hidden="true" />
                                Adicionar vídeo
                            </>
                        )}
                    </Button>
                    {atLimit && (
                        <span
                            role="tooltip"
                            className={cn(
                                "pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2",
                                "whitespace-nowrap rounded bg-neutral-800 text-white text-xs px-2 py-1",
                                "opacity-0 group-hover:opacity-100 transition-opacity",
                            )}
                        >
                            Limite de {MAX_VIDEOS} vídeos atingido. Remova um para continuar.
                        </span>
                    )}
                </div>
            </div>

            {deleteTargetId && (
                <DeleteModal
                    isPending={isDeleting}
                    onConfirm={handleDeleteConfirm}
                    onClose={() => setDeleteTargetId(null)}
                />
            )}

            <ToastContainer toasts={toasts} />
        </section>
    );
}