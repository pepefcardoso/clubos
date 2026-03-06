import type { Metadata } from "next";
import { PlansPage } from "@/components/plans/PlansPage";

export const metadata: Metadata = {
    title: "Planos — ClubOS",
};

export default function Page() {
    return <PlansPage />;
}