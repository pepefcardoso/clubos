"use client";

import { useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCharges } from "@/hooks/use-charges";
import { ChargesFilters } from "./ChargesFilters";
import { ChargesTable } from "./ChargesTable";
import { GenerateChargesButton } from "./GenerateChargesButton";
import { QrCodeModal } from "./QrCodeModal";
import { cn } from "@/lib/utils";
import type { ChargeListItem, ChargeStatus } from "@/lib/api/charges";

interface Toast {
    id: number;
    type: "success" | "error";
    message: string;
}

let toastCounter = 0;

function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const push = (type: Toast["type"], message: string) => {
        const id = ++toastCounter;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(
            () => setToasts((prev) => prev.filter((t) => t.id !== id)),
            type === "success" ? 3000 : 6000,
        );
    };

    return {
        toasts,
        pushSuccess: (msg: string) => push("success", msg),
        pushError: (msg: string) => push("error", msg),
    };
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
    if (toasts.length === 0) return null;
    return (
        <div
            aria-live="polite"
            aria-atomic="false"
            className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    role="status"
                    className={cn(
                        "flex items-start gap-3 min-w-[280px] max-w-sm rounded-md border-l-4 bg-white px-4 py-3 shadow-lg",
                        toast.type === "success" ? "border-primary-500" : "border-danger",
                    )}
                >
                    {toast.type === "success" ? (
                        <CheckCircle
                            size={16}
                            className="text-primary-500 flex-shrink-0 mt-0.5"
                            aria-hidden="true"
                        />
                    ) : (
                        <XCircle
                            size={16}
                            className="text-danger flex-shrink-0 mt-0.5"
                            aria-hidden="true"
                        />
                    )}
                    <p className="text-sm text-neutral-700">{toast.message}</p>
                </div>
            ))}
        </div>
    );
}

/** Returns the current month as "YYYY-MM" for the default filter value. */
function currentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function ChargesPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const [month, setMonth] = useState<string>(currentYearMonth);
    const [status, setStatus] = useState<ChargeStatus | "">("");
    const [page, setPage] = useState(1);
    const [qrTarget, setQrTarget] = useState<ChargeListItem | null>(null);

    const { toasts, pushSuccess, pushError } = useToasts();

    const handleMonthChange = (v: string) => {
        setMonth(v);
        setPage(1);
    };

    const handleStatusChange = (v: ChargeStatus | "") => {
        setStatus(v);
        setPage(1);
    };

    const { data, isLoading } = useCharges({
        page,
        limit: 20,
        month: month || undefined,
        status: status || undefined,
    });

    return (
        <div className="px-6 py-8 max-w-7xl mx-auto">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                        Cobranças
                    </h1>
                    <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                        Gerencie as cobranças mensais dos sócios.
                    </p>
                </div>

                {isAdmin && (
                    <GenerateChargesButton
                        onSuccess={pushSuccess}
                        onError={pushError}
                    />
                )}
            </div>

            <div className="mb-4">
                <ChargesFilters
                    month={month}
                    status={status}
                    onMonthChange={handleMonthChange}
                    onStatusChange={handleStatusChange}
                />
            </div>

            <ChargesTable
                data={data}
                isLoading={isLoading}
                page={page}
                onPageChange={setPage}
                onViewQr={setQrTarget}
            />

            {qrTarget !== null && (
                <QrCodeModal
                    key={qrTarget.id}
                    charge={qrTarget}
                    onClose={() => setQrTarget(null)}
                />
            )}

            <ToastContainer toasts={toasts} />
        </div>
    );
}