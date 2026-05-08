import type { Metadata } from "next";
import { PosTerminalPage } from "@/components/events/pos/PosTerminalPage";

export const metadata: Metadata = {
    title: "PDV — ClubOS",
    robots: "noindex, nofollow",
};

interface PageProps {
    params: Promise<{ eventId: string }>;
}

export default async function Page({ params }: PageProps) {
    const { eventId } = await params;
    return <PosTerminalPage eventId={eventId} />;
}