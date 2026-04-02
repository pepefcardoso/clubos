import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shield, UserPlus, AlertTriangle } from "lucide-react";
import { TryoutForm } from "@/components/marketing/TryoutForm";
import {
    fetchPublicClubInfo,
    ClubNotFoundError,
} from "@/lib/api/clubs-public";

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    let clubName: string | null = null;
    try {
        const club = await fetchPublicClubInfo(slug);
        clubName = club.name;
    } catch {
        // Fallback to slug-based title — 404 is handled in the page itself
    }

    const displayName = clubName ?? slug.replace(/-/g, " ");

    return {
        title: `Inscrição de Peneira — ${displayName} — ClubOS`,
        description: `Inscreva-se na peneira do ${displayName}. Preencha seus dados e envie sua documentação online.`,
        robots: { index: true, follow: true },
        openGraph: {
            title: `Peneira — ${displayName}`,
            description: `Formulário de inscrição para a peneira do ${displayName}.`,
            type: "website",
        },
    };
}

export default async function TryoutPage({ params }: Props) {
    const { slug } = await params;

    let club: { id: string; name: string; logoUrl: string | null };

    try {
        club = await fetchPublicClubInfo(slug);
    } catch (err) {
        if (err instanceof ClubNotFoundError) notFound();
        throw err;
    }

    return (
        <section
            aria-labelledby="tryout-heading"
            className="min-h-[calc(100vh-4rem)] bg-neutral-50 py-16 px-4 relative overflow-hidden"
        >
            <div
                className="absolute inset-0 opacity-[0.025] pointer-events-none"
                style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, black 1px, transparent 0)`,
                    backgroundSize: "28px 28px",
                }}
                aria-hidden="true"
            />

            <div className="max-w-2xl mx-auto relative z-10">
                <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary-600 mb-4">
                        <UserPlus size={13} aria-hidden="true" />
                        Inscrição de Peneira
                    </div>

                    <div className="flex items-center gap-4 mb-4">
                        {club.logoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={club.logoUrl}
                                alt={`Logo ${club.name}`}
                                width={56}
                                height={56}
                                className="w-14 h-14 rounded-xl object-cover border border-neutral-200 shadow-sm flex-shrink-0"
                            />
                        )}
                        <div>
                            <h1
                                id="tryout-heading"
                                className="text-3xl font-bold text-neutral-900 tracking-tight"
                            >
                                {club.name}
                            </h1>
                            <p className="mt-1 text-neutral-500 text-sm leading-relaxed">
                                Preencha o formulário abaixo para se inscrever na peneira.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-2.5 text-xs text-neutral-500 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                        <AlertTriangle
                            size={13}
                            className="text-amber-500 flex-shrink-0 mt-0.5"
                            aria-hidden="true"
                        />
                        <p>
                            Para atletas{" "}
                            <strong className="font-semibold text-amber-700">
                                menores de 18 anos
                            </strong>
                            , os campos de responsável legal serão exibidos automaticamente ao
                            informar a data de nascimento. O consentimento formal do
                            responsável é obrigatório antes da participação.
                        </p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both">
                    <TryoutForm clubSlug={slug} clubName={club.name} />
                </div>

                <div className="mt-6 flex items-center justify-center gap-2 text-xs text-neutral-400">
                    <Shield size={12} aria-hidden="true" />
                    Dados protegidos conforme a LGPD (Lei 13.709/2018) · Publicado via{" "}
                    <a
                        href="https://clubos.com.br"
                        className="underline hover:text-neutral-600 transition-colors"
                    >
                        ClubOS
                    </a>
                </div>
            </div>
        </section>
    );
}