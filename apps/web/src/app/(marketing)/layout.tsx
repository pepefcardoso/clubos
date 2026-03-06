import type { ReactNode } from "react";

/**
 * Public marketing layout — no auth, no sidebar.
 * Intentionally minimal: just a semantic wrapper.
 * Header and footer are added by T-050 (MarketingHeader / MarketingFooter).
 *
 * IMPORTANT: never import components or hooks from (app) here.
 * Auth context and React Query are already provided by the root layout.tsx.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-dvh flex flex-col bg-neutral-50">
            <main className="flex-1">{children}</main>
        </div>
    );
}