import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Contato — ClubOS",
};

/** Contact page stub — full implementation in T-053. */
export default function ContactPage() {
    return (
        <section className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
            <h1 className="text-3xl font-bold text-neutral-900 tracking-tight">
                Contato
            </h1>
            <p className="mt-2 text-neutral-500 text-sm">Em construção (T-053)</p>
        </section>
    );
}