import type { Metadata } from "next";
import { PhysioDashboardPage } from "@/components/physio/PhysioDashboardPage";

export const metadata: Metadata = {
    title: "Painel do Fisioterapeuta — ClubOS",
};

export default function Page() {
    return <PhysioDashboardPage />;
}