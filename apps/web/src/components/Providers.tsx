"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/auth.context";
import { ErrorBoundary } from "./error-boundary";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <ErrorBoundary>{children}</ErrorBoundary>
            </AuthProvider>
        </QueryClientProvider>
    );
}