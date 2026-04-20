import type { Metadata } from "next";
import { AccessScannerPage } from "@/components/access/AccessScannerPage";

export const metadata: Metadata = {
    title: "Portaria — ClubOS",
    robots: "noindex",
};

interface PageProps {
    searchParams: Promise<{ event?: string }>;
}

/**
 * /access?event=<eventId>
 *
 * The `event` query param maps to the eventId used in:
 *   POST /api/events/:eventId/access/validate
 *
 * When omitted, `AccessScannerPage` defaults to 'open' for open-access
 * scanning (no specific event context — suitable for general admission).
 */
export default async function Page({ searchParams }: PageProps) {
    const { event } = await searchParams;
    return <AccessScannerPage eventId={event ?? "open"} />;
}