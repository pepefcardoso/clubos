"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff } from "lucide-react";

interface QrCameraScannerProps {
    /** Called with the raw decoded token string whenever jsQR finds a QR code */
    onDecode: (token: string) => void;
    /**
     * When true, the decode loop is paused (e.g. while showing a result overlay).
     * The camera stream stays open so resumption is instant.
     */
    paused: boolean;
}

type CameraStatus = "requesting" | "active" | "denied" | "unavailable";

/**
 * Renders a live camera feed and continuously decodes QR codes using jsQR.
 *
 * Implementation notes:
 * - All heavy refs (video, canvas, RAF handle, stream) are stable — no re-renders
 *   per frame. Only camera status changes trigger a React re-render.
 * - Uses `facingMode: 'environment'` to prefer the rear camera on mobile.
 * - `willReadFrequently: true` on the canvas context is a performance hint that
 *   avoids GPU→CPU round-trips on every getImageData call.
 * - When `paused` changes to false, a new RAF loop is started. When `paused`
 *   changes to true, the current frame's RAF is cancelled and not rescheduled.
 * - The camera stream is stopped on unmount to release the hardware indicator.
 */
export function QrCameraScanner({ onDecode, paused }: QrCameraScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const pausedRef = useRef(paused);
    const [cameraStatus, setCameraStatus] = useState<CameraStatus>("requesting");

    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);

    /**
     * The core decode loop. Runs on every animation frame when not paused.
     * Draws the current video frame to a hidden canvas then passes the raw
     * ImageData to jsQR. Synchronous decode keeps latency minimal.
     */
    const scanLoop = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas || pausedRef.current) return;

        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
            rafRef.current = requestAnimationFrame(scanLoop);
            return;
        }

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (result?.data) {
            onDecode(result.data);
        }

        rafRef.current = requestAnimationFrame(scanLoop);
    }, [onDecode]);

    useEffect(() => {
        if (!paused && cameraStatus === "active") {
            rafRef.current = requestAnimationFrame(scanLoop);
        } else if (paused && rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [paused, cameraStatus, scanLoop]);

    useEffect(() => {
        let cancelled = false;

        async function startCamera() {
            if (!navigator.mediaDevices?.getUserMedia) {
                setCameraStatus("unavailable");
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: "environment",
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                });

                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }

                streamRef.current = stream;

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                setCameraStatus("active");
            } catch (err) {
                if (cancelled) return;
                const name = (err as Error).name;
                if (name === "NotAllowedError" || name === "PermissionDeniedError") {
                    setCameraStatus("denied");
                } else {
                    setCameraStatus("unavailable");
                }
            }
        }

        void startCamera();

        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            className="relative w-full bg-black overflow-hidden"
            style={{ aspectRatio: "1 / 1", maxWidth: "480px", margin: "0 auto" }}
        >
            <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

            <video
                ref={videoRef}
                muted
                playsInline
                className="w-full h-full object-cover"
                aria-label="Câmera para leitura de QR Code"
            />

            {cameraStatus === "denied" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 gap-3 px-6 text-center">
                    <CameraOff size={48} className="text-neutral-500" aria-hidden />
                    <p className="text-white font-semibold">Câmera bloqueada</p>
                    <p className="text-neutral-400 text-sm leading-relaxed">
                        Permita o acesso à câmera nas configurações do seu navegador e
                        recarregue a página.
                    </p>
                </div>
            )}
            {cameraStatus === "unavailable" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 gap-3 px-6 text-center">
                    <Camera size={48} className="text-neutral-500" aria-hidden />
                    <p className="text-white font-semibold">Câmera indisponível</p>
                    <p className="text-neutral-400 text-sm">
                        Nenhuma câmera foi encontrada neste dispositivo.
                    </p>
                </div>
            )}
            {cameraStatus === "requesting" && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                    <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
            )}

            {cameraStatus === "active" && !paused && (
                <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    aria-hidden="true"
                >
                    <div className="absolute inset-0 bg-black/40" />

                    <div className="relative z-10 w-56 h-56">
                        <div className="absolute inset-0 bg-transparent mix-blend-normal" />

                        <span className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-white rounded-tl-sm" />
                        <span className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-white rounded-tr-sm" />
                        <span className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-white rounded-bl-sm" />
                        <span className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-white rounded-br-sm" />

                        <div
                            className="absolute left-2 right-2 h-0.5 bg-primary-400/80 rounded-full"
                            style={{
                                animation: "scanLine 2s ease-in-out infinite",
                                top: "50%",
                            }}
                        />
                    </div>
                </div>
            )}

            <style>{`
        @keyframes scanLine {
          0%, 100% { transform: translateY(-56px); opacity: 0.4; }
          50% { transform: translateY(56px); opacity: 1; }
        }
      `}</style>
        </div>
    );
}