import type { Metadata } from "next";
import { FanProfilesPage } from "@/components/fans/FanProfilesPage";

export const metadata: Metadata = {
    title: "Torcedores — ClubOS",
};

export default function Page() {
    return <FanProfilesPage />;
}