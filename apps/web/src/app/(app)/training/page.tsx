import type { Metadata } from "next";
import { AttendanceSheet } from "@/components/training/AttendanceSheet";

export const metadata: Metadata = {
    title: "Chamada Digital — ClubOS",
};

export default function TrainingPage() {
    return <AttendanceSheet />;
}