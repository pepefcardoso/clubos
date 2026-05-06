"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff } from "lucide-react";

interface ScannerViewfinderProps {
    /** Called once per unique decoded QR string. Dedup is the caller's responsibility. */
    onScan: (rawQr: string) => void;
    /** When true the camera stream is paused (e.g. while a result card is showing). */
    paused?: boolean;
}

/** Approximate frames-per-second cap for jsQR decode loop. */
const SCAN_INTERVAL_MS = 100;

/**
 * Renders a fullscreen camera viewfinder with an animated scan-reticle overlay.
 *
 * Implementation notes:
 * - `facingMode: { ideal: "environment" }` prefers rear camera on mobile; falls
 *   back gracefully to front camera on desktops without a rear camera.
 * - The `<canvas>` is hidden (`sr-only`). It is only used as a frame buffer
 *   for jsQR — it never appears in the rendered UI.
 * - RAF loop is throttled to ~10 fps. Any faster offers diminishing returns on
 *   QR decode speed and wastes CPU on lower-end devices.
 * - On unmount all MediaStreamTrack instances are stopped to release the
 *   camera hardware and clear the browser camera-in-use indicator.
 */
export function ScannerViewfinder({
    onScan,
    paused = false,
}: ScannerViewfinderProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number>(0);
    const lastScanTsRef = useRef<number>(0);
    const pausedRef = useRef(paused);

    const [cameraState, setCameraState] = useState<
        "idle" | "starting" | "active" | "denied" | "error"
    >("idle");

    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);

    const tickFnRef = useRef<FrameRequestCallback | null>(null);

    useEffect(() => {
        tickFnRef.current = (ts: number) => {
            if (!tickFnRef.current) return;
            rafRef.current = requestAnimationFrame(tickFnRef.current);

            if (pausedRef.current) return;
            if (ts - lastScanTsRef.current < SCAN_INTERVAL_MS) return;
            lastScanTsRef.current = ts;

            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (
                !video ||
                !canvas ||
                video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
            )
                return;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            ctx.drawImage(video, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code?.data) {
                onScan(code.data);
            }
        };
    }, [onScan]);

    useEffect(() => {
        let mounted = true;

        async function startCamera() {
            setCameraState("starting");
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } },
                    audio: false,
                });

                if (!mounted) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }

                streamRef.current = stream;

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                setCameraState("active");

                if (tickFnRef.current) {
                    rafRef.current = requestAnimationFrame(tickFnRef.current);
                }
            } catch (err) {
                if (!mounted) return;
                const name = (err as DOMException)?.name;
                if (
                    name === "NotAllowedError" ||
                    name === "PermissionDeniedError"
                ) {
                    setCameraState("denied");
                } else {
                    setCameraState("error");
                }
            }
        }

        void startCamera();

        return () => {
            mounted = false;
            cancelAnimationFrame(rafRef.current);
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        };
    }, []);

    if (cameraState === "denied") {
        return (
            <div
                role="alert"
                className="flex flex-col items-center justify-center gap-4 rounded-lg bg-neutral-100 p-8 text-center"
            >
                <CameraOff
                    size={48}
                    className="text-neutral-400"
                    aria-hidden="true"
                />
                <p className="font-medium text-neutral-700">
                    Acesso à câmera negado
                </p>
                <p className="text-sm text-neutral-500">
                    Permita o acesso à câmera nas configurações do navegador para
                    escanear ingressos.
                </p>
            </div>
        );
    }

    if (cameraState === "error") {
        return (
            <div
                role="alert"
                className="flex flex-col items-center justify-center gap-4 rounded-lg bg-neutral-100 p-8 text-center"
            >
                <Camera size={48} className="text-neutral-400" aria-hidden="true" />
                <p className="font-medium text-neutral-700">
                    Câmera indisponível
                </p>
                <p className="text-sm text-neutral-500">
                    Não foi possível acessar a câmera. Verifique se outro aplicativo
                    está usando-a.
                </p>
            </div>
        );
    }

    return (
        <div className="relative w-full overflow-hidden rounded-lg bg-black">
            <canvas ref={canvasRef} className="sr-only" aria-hidden="true" />

            <video
                ref={videoRef}
                className="w-full"
                playsInline
                muted
                aria-label="Câmera para leitura de QR Code"
            />

            {cameraState === "starting" && (
                <div
                    className="absolute inset-0 flex items-center justify-center bg-black/60"
                    aria-live="polite"
                    aria-label="Iniciando câmera…"
                >
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-400 border-t-white" />
                </div>
            )}

            {cameraState === "active" && (
                <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    aria-hidden="true"
                >
                    <div className="absolute inset-0 bg-black/30" />

                    <div className="relative h-56 w-56">
                        {(["tl", "tr", "bl", "br"] as const).map((corner) => (
                            <span
                                key={corner}
                                className={[
                                    "absolute h-8 w-8 border-primary-400",
                                    corner === "tl" && "left-0 top-0 border-l-4 border-t-4",
                                    corner === "tr" && "right-0 top-0 border-r-4 border-t-4",
                                    corner === "bl" && "bottom-0 left-0 border-b-4 border-l-4",
                                    corner === "br" && "bottom-0 right-0 border-b-4 border-r-4",
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                            />
                        ))}

                        <span
                            className="absolute left-0 h-0.5 w-full animate-bounce bg-primary-400 opacity-80"
                            style={{ top: "50%" }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}