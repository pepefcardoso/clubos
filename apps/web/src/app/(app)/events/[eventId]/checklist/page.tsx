import type { Metadata } from "next";
import { GameOpsChecklist } from "@/components/events/checklist/GameOpsChecklist";

export const metadata: Metadata = {
    title: "Checklist de Jogo — ClubOS",
    robots: "noindex, nofollow",
};

interface PageProps {
    params: Promise<{ eventId: string }>;
}

export default async function Page({ params }: PageProps) {
    const { eventId } = await params;
    return <GameOpsChecklist eventId={eventId} />;
}