import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import {
    fetchPublicEventDetails,
    EventNotFoundError,
} from "@/lib/api/events-public";
import { TicketPurchasePage } from "@/components/events/public/TicketPurchasePage";

interface Props {
    params: Promise<{ clubSlug: string; eventId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { clubSlug, eventId } = await params;
    try {
        const ev = await fetchPublicEventDetails(clubSlug, eventId);
        return {
            title: `Ingressos — ${ev.opponent} — ClubOS`,
            description: `Compre ingressos para ${ev.opponent} em ${ev.venue}.`,
            robots: { index: true, follow: true },
        };
    } catch {
        return { title: "Ingressos — ClubOS" };
    }
}

export default async function EventTicketPage({ params }: Props) {
    const { clubSlug, eventId } = await params;

    let event;
    try {
        event = await fetchPublicEventDetails(clubSlug, eventId);
    } catch (err) {
        if (err instanceof EventNotFoundError) notFound();
        throw err;
    }

    return (
        <Suspense
            fallback={
                <div className="flex justify-center items-center py-20">
                    <Loader2 size={24} className="text-primary-500 animate-spin" aria-hidden="true" />
                    <span className="sr-only">Carregando…</span>
                </div>
            }
        >
            <TicketPurchasePage initialEvent={event} clubSlug={clubSlug} eventId={eventId} />
        </Suspense>
    );
}