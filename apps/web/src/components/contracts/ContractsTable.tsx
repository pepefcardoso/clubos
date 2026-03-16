'use client';

import { FileText, Pencil } from 'lucide-react';
import type { PaginatedResponse } from '../../../../../packages/shared-types/src/index.js';
import type { ContractResponse, ContractType, ContractStatus } from '@/lib/api/contracts';
import type { AthleteResponse } from '@/lib/api/athletes';
import { ContractStatusBadge } from './ContractStatusBadge';
import { Button } from '@/components/ui/button';

const TYPE_LABELS: Record<ContractType, string> = {
    PROFESSIONAL: 'Profissional',
    AMATEUR: 'Amador',
    FORMATIVE: 'Formativo',
    LOAN: 'Empréstimo',
};

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const datePart = iso.split('T')[0];
    const [y, m, d] = datePart.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR').format(new Date(y, m - 1, d));
}

function SkeletonRows({ hasActions }: { hasActions: boolean }) {
    const colCount = hasActions ? 8 : 7;
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

function EmptyState() {
    return (
        <tr>
            <td colSpan={8}>
                <div className="py-16 text-center">
                    <FileText size={48} className="mx-auto text-neutral-300 mb-3" aria-hidden="true" />
                    <p className="text-neutral-600 font-medium text-[0.9375rem]">
                        Nenhum contrato encontrado
                    </p>
                    <p className="text-neutral-400 text-sm mt-1">
                        Cadastre um contrato para um atleta usando o botão acima.
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
                    ? 'Nenhum contrato'
                    : `Mostrando ${from}–${to} de ${total} contrato${total !== 1 ? 's' : ''}`}
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

interface ContractsTableProps {
    data: PaginatedResponse<ContractResponse> | undefined;
    athletes: AthleteResponse[];
    isLoading: boolean;
    page: number;
    onPageChange: (page: number) => void;
    onEdit?: (contract: ContractResponse) => void;
}

export function ContractsTable({
    data,
    athletes,
    isLoading,
    page,
    onPageChange,
    onEdit,
}: ContractsTableProps) {
    const hasActions = !!onEdit;
    const athleteMap = new Map(athletes.map((a) => [a.id, a.name]));

    return (
        <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Lista de contratos">
                    <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200">
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Atleta
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Tipo
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Status
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Início
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Término
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                BID
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Cód. Federação
                            </th>
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
                            <SkeletonRows hasActions={hasActions} />
                        ) : !data || data.data.length === 0 ? (
                            <EmptyState />
                        ) : (
                            data.data.map((contract) => (
                                <tr
                                    key={contract.id}
                                    className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                                >
                                    <td className="px-4 py-3 font-medium text-neutral-900">
                                        {athleteMap.get(contract.athleteId) ?? (
                                            <span className="text-neutral-400 font-mono text-xs">{contract.athleteId}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-700">
                                        {TYPE_LABELS[contract.type as ContractType]}
                                    </td>
                                    <td className="px-4 py-3">
                                        <ContractStatusBadge status={contract.status as ContractStatus} />
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600">{formatDate(contract.startDate)}</td>
                                    <td className="px-4 py-3 text-neutral-600">{formatDate(contract.endDate)}</td>
                                    <td className="px-4 py-3">
                                        {contract.bidRegistered ? (
                                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary-50 text-primary-700">
                                                Registrado
                                            </span>
                                        ) : (
                                            <span className="text-neutral-400 text-xs">Pendente</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600 font-mono text-xs">
                                        {contract.federationCode ?? <span className="text-neutral-400">—</span>}
                                    </td>
                                    {hasActions && (
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end items-center">
                                                <button
                                                    type="button"
                                                    onClick={() => onEdit?.(contract)}
                                                    className="p-1.5 text-neutral-400 hover:text-primary-600 transition-colors rounded"
                                                    aria-label={`Editar contrato do atleta ${athleteMap.get(contract.athleteId) ?? contract.athleteId}`}
                                                >
                                                    <Pencil size={15} aria-hidden="true" />
                                                </button>
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