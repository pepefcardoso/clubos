import type { Metadata } from "next";
import { TemplatesPage } from "@/components/templates/TemplatesPage";

export const metadata: Metadata = {
    title: "Mensagens — ClubOS",
};

export default function Page() {
    return <TemplatesPage />;
}