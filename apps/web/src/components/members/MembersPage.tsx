"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Upload } from "lucide-react";
import type { MemberStatus } from "../../../../../packages/shared-types/src/index.js";
import { useAuth } from "@/hooks/use-auth";
import { fetchMembers, type MemberResponse } from "@/lib/api/members";
import { Button } from "@/components/ui/button";
import { MembersFilters } from "./MembersFilters";
import { MembersTable } from "./MembersTable";
import { MemberFormModal } from "./MemberFormModal";
import { CsvImportModal } from "./CsvImportModal";
import { MemberPaymentsModal } from "./MemberPaymentsModal";
import { MemberCardModal } from "./MemberCardModal"
import { useToasts } from "@/hooks/use-toasts.js";
import { ToastContainer } from "../ui/toast-container.js";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function MembersPage() {
  const { getAccessToken, user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MemberStatus | "">("");
  const [page, setPage] = useState(1);

  const [formTarget, setFormTarget] = useState<MemberResponse | "new" | null>(
    null,
  );
  const [showImportModal, setShowImportModal] = useState(false);

  const [paymentsTarget, setPaymentsTarget] = useState<MemberResponse | null>(
    null,
  );

  const [cardTarget, setCardTarget] = useState<MemberResponse | null>(null)

  const { toasts, pushSuccess, pushError } = useToasts();

  const debouncedSearch = useDebouncedValue(search, 300);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: MemberStatus | "") => {
    setStatus(value);
    setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["members", { search: debouncedSearch, status, page }],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return fetchMembers(
        {
          search: debouncedSearch,
          status: status || undefined,
          page,
          limit: 20,
        },
        token,
      );
    },
  });

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            Sócios
          </h1>
          <p className="text-neutral-500 mt-1 text-[0.9375rem]">
            Gerencie o cadastro de sócios do clube.
          </p>
        </div>

        {isAdmin && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowImportModal(true)}
            >
              <Upload size={15} aria-hidden="true" />
              Importar CSV
            </Button>
            <Button onClick={() => setFormTarget("new")}>
              <Plus size={16} aria-hidden="true" />
              Novo sócio
            </Button>
          </div>
        )}
      </div>

      <div className="mb-4">
        <MembersFilters
          search={search}
          status={status}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
        />
      </div>

      <MembersTable
        data={data}
        isLoading={isLoading}
        search={debouncedSearch}
        page={page}
        onPageChange={setPage}
        onEdit={isAdmin ? (member) => setFormTarget(member) : undefined}
        onViewPayments={(member) => setPaymentsTarget(member)}
        onCard={(member) => setCardTarget(member)}
      />

      {formTarget !== null && (
        <MemberFormModal
          key={formTarget === "new" ? "new" : formTarget.id}
          member={formTarget === "new" ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSuccess={pushSuccess}
          onError={pushError}
        />
      )}

      {showImportModal && (
        <CsvImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={(msg) => pushSuccess(msg)}
        />
      )}

      {paymentsTarget !== null && (
        <MemberPaymentsModal
          key={paymentsTarget.id}
          member={paymentsTarget}
          onClose={() => setPaymentsTarget(null)}
        />
      )}

      {cardTarget !== null && (
        <MemberCardModal
          key={cardTarget.id}
          memberId={cardTarget.id}
          memberName={cardTarget.name}
          onClose={() => setCardTarget(null)}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}