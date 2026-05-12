import { ScoutOnboardingWizard } from "@/components/scout/ScoutOnboardingWizard";

export const metadata = { title: "Scout — Criar conta | ClubOS" };

export default function ScoutOnboardingPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-6">
            <ScoutOnboardingWizard />
        </div>
    );
}