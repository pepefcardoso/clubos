import { ShowcaseManagerPage } from "@/components/scout/ShowcaseManagerPage";
import { AthleteVideoManager } from "@/components/scout/AthleteVideoManager";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Showcase do Atleta — ClubOS",
    robots: "noindex, nofollow",
};

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
    const { id } = await params;
    return (
        <>
            <ShowcaseManagerPage athleteId={id} />
            <div className="px-6 pb-8 max-w-3xl mx-auto">
                <AthleteVideoManager athleteId={id} />
            </div>
        </>
    );
}