import type { Metadata } from "next";
import { AthletesPage } from "@/components/athletes/AthletesPage";

export const metadata: Metadata = {
    title: "Atletas — ClubOS",
};

export default function Page() {
    return <AthletesPage />;
}