import type { Metadata } from "next";
import { BalanceSheetsPanel } from "@/components/saf/BalanceSheetsPanel";

export const metadata: Metadata = {
    title: "SAF — ClubOS",
};

export default function SafPage() {
    return (
        <div className="px-6 py-8 max-w-7xl mx-auto space-y-10">
            <div>
                <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                    Compliance SAF
                </h1>
                <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                    Transparência financeira conforme Lei 14.193/2021.
                </p>
            </div>

            <BalanceSheetsPanel />
        </div>
    );
}