import type { Metadata } from "next";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const metadata: Metadata = {
    title: "Dashboard — ClubOS",
};

export default function DashboardPage() {
    return <DashboardClient />;
}