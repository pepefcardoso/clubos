import type { Metadata } from "next";
import { AttendanceSheet } from "@/components/training/AttendanceSheet";
import { AttendanceRankingWidget } from "@/components/training/AttendanceRankingWidget";

export const metadata: Metadata = {
    title: "Chamada Digital — ClubOS",
};

export default function TrainingPage() {
    return (
        <div className="flex flex-col gap-6 pb-8">
            <AttendanceSheet />
            <div className="px-4">
                <AttendanceRankingWidget />
            </div>
        </div>
    );
}