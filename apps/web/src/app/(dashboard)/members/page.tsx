import type { Metadata } from "next";
import { MembersPage } from "@/components/members/MembersPage";

export const metadata: Metadata = {
    title: "Sócios — ClubOS",
};

export default function Page() {
    return <MembersPage />;
}