import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { VerificationResult } from "@/components/members/VerificationResult";

export const metadata: Metadata = {
    title: "Verificar Carteirinha — ClubOS",
    description: "Verifique a autenticidade de uma carteirinha digital de sócio.",
    robots: { index: false, follow: false },
};

/**
 * Public page rendered when someone scans a member card QR code.
 *
 * Route: /verificar?token=<cardToken>
 *
 * This page is in the (marketing) route group so it inherits the
 * MarketingHeader + MarketingFooter layout and requires no authentication.
 *
 * The `VerificationResult` component is wrapped in Suspense because it calls
 * `useSearchParams()`, which requires a Suspense boundary in Next.js 14
 * App Router to avoid de-opting the page to client-side rendering entirely.
 */
export default function VerifyPage() {
    return (
        <section
            className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 bg-neutral-50"
            aria-labelledby="verify-heading"
        >
            <h1 id="verify-heading" className="sr-only">
                Verificação de Carteirinha Digital
            </h1>

            <Suspense
                fallback={
                    <div className="flex flex-col items-center gap-3">
                        <Loader2
                            size={28}
                            className="text-primary-500 animate-spin"
                            aria-hidden="true"
                        />
                        <p className="text-sm text-neutral-500">Verificando…</p>
                    </div>
                }
            >
                <VerificationResult />
            </Suspense>
        </section>
    );
}