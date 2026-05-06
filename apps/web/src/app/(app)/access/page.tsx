import type { Metadata } from "next";
import { AccessScannerPage } from "@/components/access/AccessScannerPage";

export const metadata: Metadata = {
    title: "Portaria — ClubOS",
    robots: "noindex, nofollow",
};

interface PageProps {
    searchParams: Promise<{ event?: string }>;
}

/**
 * /access?event=<eventId>
 *
 * The `event` query param pre-selects the event in the AccessScannerPage picker.
 * When omitted the picker starts in "no event selected" state.
 *
 * ADMIN-only guard is enforced inside AccessScannerPage via useAuth + router.replace.
 * Server-side guard is left to the middleware layer (auth middleware redirects
 * non-authenticated requests before this page renders).
 */
export default async function Page({ searchParams }: PageProps) {
    const { event } = await searchParams;
    return <AccessScannerPage eventId={event} />;
}