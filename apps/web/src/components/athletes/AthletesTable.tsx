"use client";

import { Users, Pencil, Stethoscope, History } from "lucide-react";
import type { PaginatedResponse } from "../../../../../packages/shared-types/src/index.js";
import type { AthleteResponse } from "@/lib/api/athletes";
import { AthleteStatusBadge } from "./AthleteStatusBadge";
import { RtpStatusCell } from "./RtpStatusCell";
import { Button } from "@/components/ui/button";
import { formatCPF, formatDateISO } from "@/lib/format.js";

function SkeletonRows({
  hasActions,
  showRtp,
}: {
  hasActions: boolean;
  showRtp: boolean;
}) {
  const colCount = 5 + (hasActions ? 1 : 0) + (showRtp ? 1 : 0);
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-neutral-100">
          {Array.from({ length: colCount }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-4 rounded bg-neutral-200 animate-pulse"
                style={{ width: `${60 + ((i * 3 + j * 7) % 40)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <tr>
      <td colSpan={7}>
        <div className="py-16 text-center">
          <Users
            size={48}
            className="mx-auto text-neutral-300 mb-3"
            aria-hidden="true"
          />
          <p className="text-neutral-600 font-medium text-[0.9375rem]">
            Nenhum atleta encontrado
          </p>
          <p className="text-neutral-400 text-sm mt-1">
            {hasSearch
              ? "Tente buscar por outro nome ou CPF."
              : "Cadastre o primeiro atleta do clube."}
          </p>
        </div>
      </td>
    </tr>
  );
}

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit);
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-1 py-3">
      <p className="text-sm text-neutral-500">
        {total === 0
          ? "Nenhum atleta"
          : `Mostrando ${from}–${to} de ${total} atleta${total !== 1 ? "s" : ""}`}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          ← Anterior
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Próxima página"
        >
          Próxima →
        </Button>
      </div>
    </div>
  );
}

interface AthletesTableProps {
  data: PaginatedResponse<AthleteResponse> | undefined;
  isLoading: boolean;
  search: string;
  page: number;
  onPageChange: (page: number) => void;
  onEdit?: (athlete: AthleteResponse) => void;
  onMedicalRecord?: (athlete: AthleteResponse) => void;
  onTimeline?: (athlete: AthleteResponse) => void;
  showRtp?: boolean;
}

export function AthletesTable({
  data,
  isLoading,
  search,
  page,
  onPageChange,
  onEdit,
  onMedicalRecord,
  onTimeline,
  showRtp = false,
}: AthletesTableProps) {
  const hasActions = !!onEdit || !!onMedicalRecord || !!onTimeline;

  return (
    <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Lista de atletas">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Nome
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                CPF
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Data de Nasc.
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Posição
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
              >
                Status
              </th>
              {showRtp && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                >
                  RTP
                </th>
              )}
              {hasActions && (
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide"
                >
                  Ações
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows hasActions={hasActions} showRtp={showRtp} />
            ) : !data || data.data.length === 0 ? (
              <EmptyState hasSearch={!!search} />
            ) : (
              data.data.map((athlete) => (
                <tr
                  key={athlete.id}
                  className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {athlete.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-neutral-700">
                    {formatCPF(athlete.cpf)}
                  </td>
                  <td className="px-4 py-3 font-mono text-neutral-700">
                    {formatDateISO(athlete.birthDate)}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {athlete.position ?? (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <AthleteStatusBadge status={athlete.status} />
                  </td>
                  {showRtp && (
                    <td className="px-4 py-3">
                      <RtpStatusCell athleteId={athlete.id} />
                    </td>
                  )}
                  {hasActions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end items-center gap-1">
                        {onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(athlete)}
                            className="p-1.5 text-neutral-400 hover:text-primary-600 transition-colors rounded"
                            aria-label={`Editar atleta ${athlete.name}`}
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                        )}
                        {onMedicalRecord && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onMedicalRecord(athlete)}
                            aria-label={`Registrar lesão para ${athlete.name}`}
                          >
                            <Stethoscope size={14} aria-hidden="true" />
                            Prontuário
                          </Button>
                        )}
                        {onTimeline && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onTimeline(athlete)}
                            aria-label={`Ver histórico clínico de ${athlete.name}`}
                          >
                            <History size={14} aria-hidden="true" />
                            Histórico
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="border-t border-neutral-100 px-4">
          <Pagination
            page={page}
            limit={data.limit}
            total={data.total}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}
