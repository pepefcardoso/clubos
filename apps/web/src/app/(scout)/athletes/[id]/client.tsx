"use client";

import { useAthleteProfile } from "@/hooks/use-scout-search";
import { AthletePublicProfile } from "@/components/scout/AthletePublicProfile";

function ProfileSkeleton() {
    return (
        <div className="space-y-6 max-w-2xl mx-auto animate-pulse" aria-busy="true" aria-label="Carregando perfil do atleta">
            <div className="flex items-start gap-4">
                <div className="h-14 w-14 rounded-full bg-neutral-200 flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 w-32 rounded bg-neutral-200" />
                    <div className="h-3 w-48 rounded bg-neutral-100" />
                    <div className="h-5 w-24 rounded-full bg-neutral-100" />
                </div>
            </div>
            <div className="h-8 rounded bg-neutral-100" />
            <div className="h-[140px] rounded bg-neutral-100" />
            <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="h-2.5 w-12 rounded bg-neutral-100" />
                        <div className="flex-1 h-1.5 rounded-full bg-neutral-100" />
                        <div className="h-2.5 w-6 rounded bg-neutral-100" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function ProfileNotFound() {
    return (
        <div className="flex flex-col items-center gap-2 py-16 max-w-2xl mx-auto text-center">
            <p className="text-base font-medium text-neutral-700">Perfil não encontrado</p>
            <p className="text-sm text-neutral-500">
                Este perfil pode ter sido removido ou ainda não está publicado.
            </p>

            <a
                href="/scout/search"
                className="mt-2 text-sm font-medium text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
                Voltar à busca
            </a>
        </div >

    );
}

interface AthleteProfileClientProps {
    showcaseId: string;
}

export function AthleteProfileClient({ showcaseId }: AthleteProfileClientProps) {
    const { data: profile, isLoading, isError } = useAthleteProfile(showcaseId);

    if (isLoading) return <ProfileSkeleton />;
    if (isError || !profile) return <ProfileNotFound />;

    return (
        <main className="px-4 py-6 sm:px-6 sm:py-8">
            <AthletePublicProfile profile={profile} hasPendingRequest={false} />
        </main>
    );
}