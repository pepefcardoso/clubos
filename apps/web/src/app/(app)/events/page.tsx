import type { Metadata } from "next";
import { EventsPage } from "@/components/events/EventsPage";

export const metadata: Metadata = {
    title: "Eventos — ClubOS",
};

export default function Page() {
    return <EventsPage />;
}