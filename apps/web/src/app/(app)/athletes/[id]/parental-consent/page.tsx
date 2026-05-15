import { ParentalConsentAdminForm } from "@/components/scout/ParentalConsentAdminForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Consentimento Parental — ClubOS",
    robots: "noindex, nofollow",
};

interface Props {
    params: Promise<{ id: string }>;
}

export default async function ParentalConsentPage({ params }: Props) {
    const { id } = await params;
    return (
        <div className="px-6 py-8 max-w-7xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-neutral-800">Consentimento Parental</h1>
                <p className="text-sm text-neutral-500 mt-1">
                    Registre o consentimento do responsável legal para contato de scouts com atleta menor de
                    idade.
                </p>
            </div>
            <ParentalConsentAdminForm athleteId={id} />
        </div>
    );
}