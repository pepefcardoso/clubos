"use client";

import { useServiceWorker } from "@/hooks/use-service-worker";

export function PwaUpdateBanner() {
    const { status, applyUpdate } = useServiceWorker();

    if (status !== "update-available") return null;

    return (
        <div
            role="alert"
            aria-live="polite"
            className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-lg bg-neutral-800 px-4 py-3 text-sm text-white shadow-lg"
        >
            <span>Nova versão disponível.</span>
            <button
                onClick={applyUpdate}
                className="rounded bg-primary-500 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-600 active:bg-primary-700 transition-colors"
            >
                Atualizar agora
            </button>
        </div>
    );
}