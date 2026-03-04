import type { Metadata } from "next";
import { DashboardKpis } from "@/components/dashboard/DashboardKpis";
import { DelinquencyChart } from "@/components/dashboard/DelinquencyChart";

export const metadata: Metadata = {
    title: "Dashboard — ClubOS",
};

export default function DashboardPage() {
    return (
        <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                    Dashboard
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                    Visão geral financeira do clube
                </p>
            </div>

            <DashboardKpis />
            <DelinquencyChart />
        </div>
    );
}