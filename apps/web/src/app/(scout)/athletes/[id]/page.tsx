import { AthleteProfileClient } from "./client";

interface PageProps {
    params: { id: string };
}

export default function AthleteProfilePage({ params }: PageProps) {
    return <AthleteProfileClient showcaseId={params.id} />;
}