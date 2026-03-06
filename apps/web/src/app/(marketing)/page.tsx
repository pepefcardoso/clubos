import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "ClubOS — Gestão financeira para clubes de futebol",
    description:
        "Reduza a inadimplência do seu clube em até 25% com cobranças Pix automáticas e régua de cobrança via WhatsApp.",
};

/**
 * Landing page stub — full implementation in T-051.
 *
 * This file intentionally replaces apps/web/src/app/page.tsx, which
 * previously contained only a redirect("/login"). That file must be deleted
 * to avoid a duplicate-route build error with this one.
 */
export default function LandingPage() {
    return (
        <section className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
                ClubOS
            </h1>
            <p className="mt-2 text-neutral-500 text-sm">
                Landing page — em construção (T-051)
            </p>
        </section>
    );
}