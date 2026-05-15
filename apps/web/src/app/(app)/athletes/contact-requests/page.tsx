import type { Metadata } from "next";
import { ClubContactRequestsPage } from "@/components/contact-requests/ClubContactRequestsPage";

export const metadata: Metadata = {
    title: "Solicitações de Contato — ClubOS",
    robots: "noindex, nofollow",
};

export default function Page() {
    return <ClubContactRequestsPage />;
}