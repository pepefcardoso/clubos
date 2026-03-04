"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/Sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace("/login");
        }
    }, [isLoading, isAuthenticated, router]);

    if (isLoading) {
        return <DashboardSkeleton />;
    }

    if (!isAuthenticated) {
        return null;
    }

    return <AppShell>{children}</AppShell>;
}

function DashboardSkeleton() {
    return (
        <div className="min-h-dvh flex bg-neutral-100">
            <div className="hidden md:flex flex-col w-[240px] bg-white border-r border-neutral-200 p-4 gap-3 flex-shrink-0">
                <div className="flex items-center gap-2.5 pb-4 border-b border-neutral-100 mb-1">
                    <div className="w-7 h-7 rounded-lg bg-neutral-200 animate-pulse" />
                    <div className="h-4 w-20 rounded bg-neutral-200 animate-pulse" />
                </div>

                {[...Array(4)].map((_, i) => (
                    <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2"
                    >
                        <div
                            className="w-4 h-4 rounded bg-neutral-200 animate-pulse flex-shrink-0"
                            style={{ animationDelay: `${i * 80}ms` }}
                        />
                        <div
                            className="h-3.5 rounded bg-neutral-200 animate-pulse"
                            style={{
                                width: `${50 + (i * 17) % 35}%`,
                                animationDelay: `${i * 80}ms`,
                            }}
                        />
                    </div>
                ))}

                <div className="mt-auto pt-3 border-t border-neutral-100 flex items-center gap-3 px-2 py-2">
                    <div className="w-8 h-8 rounded-full bg-neutral-200 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-3/4 rounded bg-neutral-200 animate-pulse" />
                        <div className="h-2.5 w-1/2 rounded bg-neutral-200 animate-pulse" />
                    </div>
                </div>
            </div>

            <div className="flex-1 p-8">
                <div className="max-w-7xl mx-auto space-y-6">
                    <div className="space-y-2">
                        <div className="h-7 w-48 rounded-md bg-neutral-200 animate-pulse" />
                        <div className="h-4 w-72 rounded bg-neutral-200 animate-pulse" />
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[...Array(4)].map((_, i) => (
                            <div
                                key={i}
                                className="h-24 rounded-md bg-neutral-200 animate-pulse"
                                style={{ animationDelay: `${i * 100}ms` }}
                            />
                        ))}
                    </div>

                    <div className="h-64 rounded-md bg-neutral-200 animate-pulse" />
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.5; }
                }
                .animate-pulse { animation: pulse 1.5s ease-in-out infinite; }
            `}</style>
        </div>
    );
}