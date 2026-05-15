import type { Metadata } from "next";
import { ScoutInboxPage } from "@/components/scout/ScoutInboxPage";

export const metadata: Metadata = {
    title: "Inbox — ClubOS Scout",
    robots: "noindex, nofollow",
};

export default function Page() {
    return <ScoutInboxPage />;
}