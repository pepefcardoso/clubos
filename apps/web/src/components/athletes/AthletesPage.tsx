"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchAthletes,
  type AthleteResponse,
  type AthleteStatus,
} from "@/lib/api/athletes";
import { Button } from "@/components/ui/button";
import { AthletesFilters } from "./AthletesFilters";
import { AthletesTable } from "./AthletesTable";
import { AthleteFormModal } from "./AthleteFormModal";
import { MedicalRecordFormModal } from "@/components/medical/MedicalRecordFormModal";
import { MedicalTimelineModal } from "@/components/medical/MedicalTimelineModal";
import { canAccessClinicalData } from "@/lib/role-utils";
import { useToasts } from "@/hooks/use-toasts";
import { ToastContainer } from "../ui/toast-container";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

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
