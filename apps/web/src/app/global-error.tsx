"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html>
            <body>
                <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-neutral-50">
                    <h2 className="text-2xl font-bold text-neutral-900">Algo correu muito mal.</h2>
                    <p className="mt-2 text-neutral-500">Um erro crítico de sistema foi detectado e reportado.</p>
                    <button
                        onClick={() => reset()}
                        className="mt-6 px-4 py-2 bg-primary-600 text-white rounded-md font-semibold"
                    >
                        Tentar novamente
                    </button>
                </div>
            </body>
        </html>
    );
}