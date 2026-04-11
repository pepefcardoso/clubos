"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchAthletes,
  type AthleteResponse,
  type AthleteStatus,
} from "@/lib/api/athletes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AthletesFilters } from "./AthletesFilters";
import { AthletesTable } from "./AthletesTable";
import { AthleteFormModal } from "./AthleteFormModal";
import { MedicalRecordFormModal } from "@/components/medical/MedicalRecordFormModal";
import { MedicalTimelineModal } from "@/components/medical/MedicalTimelineModal";
import { canAccessClinicalData } from "@/lib/role-utils";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

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
      () => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      },
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

interface ModalTarget {
  athleteId: string;
  athleteName: string;
}

export function AthletesPage() {
  const { getAccessToken, user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const canSeeClinical = canAccessClinicalData(user?.role);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AthleteStatus | "">("");
  const [page, setPage] = useState(1);

  const [formTarget, setFormTarget] = useState<AthleteResponse | "new" | null>(
    null,
  );

  const [medicalTarget, setMedicalTarget] = useState<ModalTarget | null>(null);
  const [timelineTarget, setTimelineTarget] = useState<ModalTarget | null>(
    null,
  );

  const { toasts, pushSuccess, pushError } = useToasts();

  const debouncedSearch = useDebouncedValue(search, 300);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: AthleteStatus | "") => {
    setStatus(value);
    setPage(1);
  };

  const openMedicalModal = (athlete: AthleteResponse) => {
    setMedicalTarget({ athleteId: athlete.id, athleteName: athlete.name });
  };

  const closeMedicalModal = () => setMedicalTarget(null);

  const openTimelineModal = (athlete: AthleteResponse) => {
    setTimelineTarget({ athleteId: athlete.id, athleteName: athlete.name });
  };

  const closeTimelineModal = () => setTimelineTarget(null);

  const { data, isLoading } = useQuery({
    queryKey: ["athletes", { search: debouncedSearch, status, page }],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return fetchAthletes(
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
            Atletas
          </h1>
          <p className="text-neutral-500 mt-1 text-[0.9375rem]">
            Gerencie o cadastro de atletas do clube.
          </p>
        </div>

        {isAdmin && (
          <Button onClick={() => setFormTarget("new")}>
            <Plus size={16} aria-hidden="true" />
            Novo atleta
          </Button>
        )}
      </div>

      <div className="mb-4">
        <AthletesFilters
          search={search}
          status={status}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
        />
      </div>

      <AthletesTable
        data={data}
        isLoading={isLoading}
        search={debouncedSearch}
        page={page}
        onPageChange={setPage}
        onEdit={isAdmin ? (athlete) => setFormTarget(athlete) : undefined}
        onMedicalRecord={canSeeClinical ? openMedicalModal : undefined}
        onTimeline={canSeeClinical ? openTimelineModal : undefined}
        showRtp={true}
      />

      {formTarget !== null && (
        <AthleteFormModal
          key={formTarget === "new" ? "new" : formTarget.id}
          athlete={formTarget === "new" ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSuccess={pushSuccess}
          onError={pushError}
        />
      )}

      {medicalTarget !== null && canSeeClinical && (
        <MedicalRecordFormModal
          key={medicalTarget.athleteId}
          athleteId={medicalTarget.athleteId}
          athleteName={medicalTarget.athleteName}
          onClose={closeMedicalModal}
          onSuccess={() =>
            pushSuccess(
              `Prontuário registrado para ${medicalTarget.athleteName}.`,
            )
          }
        />
      )}

      {timelineTarget !== null && canSeeClinical && (
        <MedicalTimelineModal
          key={timelineTarget.athleteId}
          athleteId={timelineTarget.athleteId}
          athleteName={timelineTarget.athleteName}
          onClose={closeTimelineModal}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}
