"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCharges } from "@/hooks/use-charges";
import { ChargesFilters } from "./ChargesFilters";
import { ChargesTable } from "./ChargesTable";
import { GenerateChargesButton } from "./GenerateChargesButton";
import { QrCodeModal } from "./QrCodeModal";
import type { ChargeListItem, ChargeStatus } from "@/lib/api/charges";
import { useToasts } from "@/hooks/use-toasts";
import { ToastContainer } from "../ui/toast-container";

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
          <GenerateChargesButton onSuccess={pushSuccess} onError={pushError} />
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
