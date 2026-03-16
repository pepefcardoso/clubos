import type { Metadata } from "next";
import { ChargesPage } from "@/components/charges/ChargesPage";

export const metadata: Metadata = {
    title: "Cobranças — ClubOS",
};

export default function Page() {
    return <ChargesPage />;
}