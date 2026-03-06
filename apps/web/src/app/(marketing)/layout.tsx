import type { ReactNode } from "react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

/**
 * Public marketing layout — no auth, no sidebar.
 *
 * IMPORTANT: never import components or hooks from (app) here.
 * Auth context and React Query are provided by the root layout.tsx.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-dvh flex flex-col bg-neutral-50">
            <MarketingHeader />
            <main className="flex-1">{children}</main>
            <MarketingFooter />
        </div>
    );
}