"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ScoutAuthProvider, useScoutAuthContext } from "@/contexts/scout-auth.context";

function ScoutGuard({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useScoutAuthContext();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) router.replace("/scout-login");
    }, [isLoading, isAuthenticated, router]);

    if (isLoading) {
        return (
            <div
                className="min-h-dvh bg-neutral-100 flex items-center justify-center"
                aria-busy="true"
                aria-label="Carregando sessão…"
            />
        );
    }

    if (!isAuthenticated) return null;

    return <>{children}</>;
}

export default function ScoutLayout({ children }: { children: ReactNode }) {
    return (
        <ScoutAuthProvider>
            <ScoutGuard>
                <div className="min-h-dvh bg-neutral-50">{children}</div>
            </ScoutGuard>
        </ScoutAuthProvider>
    );
}