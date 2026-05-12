import { ShowcaseManagerPage } from "@/components/scout/ShowcaseManagerPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Showcase do Atleta — ClubOS",
    robots: "noindex, nofollow",
};

interface PageProps {
    params: Promise<{ id: string }>;
}

/**
 * /athletes/:id/showcase
 *
 * ADMIN-only guard enforced in ShowcaseManagerPage via useAuth + router.replace.
 * Server-side auth is handled by the middleware layer.
 */
export default async function Page({ params }: PageProps) {
    const { id } = await params;
    return <ShowcaseManagerPage athleteId={id} />;
}