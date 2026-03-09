"use client";

import { useRealTimeEvents } from "@/hooks/use-real-time-events";
import { DashboardKpis } from "./DashboardKpis";
import { DelinquencyChart } from "./DelinquencyChart";
import { OverdueMembersTable } from "./OverdueMembersTable";

export function DashboardClient() {
    useRealTimeEvents();

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
            <OverdueMembersTable />
        </div>
    );
}