import type { Metadata } from "next";
import { ScoutSearchPage } from "@/components/scout/ScoutSearchPage";

export const metadata: Metadata = {
    title: "Buscar Atletas — ScoutLink | ClubOS",
    description: "Encontre atletas verificados por posição, idade, estado e indicadores de saúde.",
};

export default function ScoutSearchRoute() {
    return <ScoutSearchPage />;
}