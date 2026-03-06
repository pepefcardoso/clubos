import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Preços — ClubOS",
};

/** Pricing page stub — full implementation in T-052. */
export default function PricingPage() {
    return (
        <section className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
                Planos e Preços
            </h1>
            <p className="mt-2 text-neutral-500 text-sm">Em construção (T-052)</p>
        </section>
    );
}