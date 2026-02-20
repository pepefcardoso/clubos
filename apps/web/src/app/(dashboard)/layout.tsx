"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

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

    return <>{children}</>;
}

function DashboardSkeleton() {
    return (
        <div
            style={{
                minHeight: "100dvh",
                display: "flex",
                background: "#f4f3ef",
            }}
        >
            <div
                style={{
                    width: "240px",
                    background: "white",
                    borderRight: "1px solid #e8e6e0",
                    padding: "24px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        height: "36px",
                        borderRadius: "8px",
                        background: "#e8e6e0",
                        marginBottom: "16px",
                        animation: "pulse 1.5s ease-in-out infinite",
                    }}
                />
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        style={{
                            height: "32px",
                            borderRadius: "6px",
                            background: "#e8e6e0",
                            opacity: 1 - i * 0.15,
                            animation: "pulse 1.5s ease-in-out infinite",
                            animationDelay: `${i * 0.1}s`,
                        }}
                    />
                ))}
            </div>

            <div style={{ flex: 1, padding: "32px 24px" }}>
                <div
                    style={{
                        height: "28px",
                        width: "200px",
                        borderRadius: "6px",
                        background: "#e8e6e0",
                        marginBottom: "24px",
                        animation: "pulse 1.5s ease-in-out infinite",
                    }}
                />
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: "16px",
                    }}
                >
                    {[...Array(4)].map((_, i) => (
                        <div
                            key={i}
                            style={{
                                height: "96px",
                                borderRadius: "8px",
                                background: "#e8e6e0",
                                animation: "pulse 1.5s ease-in-out infinite",
                                animationDelay: `${i * 0.1}s`,
                            }}
                        />
                    ))}
                </div>
            </div>

            <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
        </div>
    );
}