"use client";

import { Users, Pencil } from "lucide-react";
import type { MemberStatus, PaginatedResponse } from "../../../../../packages/shared-types/src/index.js";
import type { MemberResponse } from "../../../../api/src/modules/members/members.schema";
import { MemberStatusBadge } from "./MemberStatusBadge";
import { Button } from "@/components/ui/button";

function formatCPF(cpf: string): string {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatPhone(phone: string): string {
    if (phone.length === 11) {
        return phone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    }
    return phone.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
}

function formatDate(date: Date | string): string {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(date));
}

function SkeletonRows({ hasActions }: { hasActions: boolean }) {
    const colCount = hasActions ? 7 : 6;
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
                    <Users size={48} className="mx-auto text-neutral-300 mb-3" aria-hidden="true" />
                    <p className="text-neutral-600 font-medium text-[0.9375rem]">
                        Nenhum sócio encontrado
                    </p>
                    <p className="text-neutral-400 text-sm mt-1">
                        {hasSearch
                            ? "Tente buscar por outro nome ou CPF."
                            : "Importe uma lista CSV ou cadastre manualmente."}
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
                    ? "Nenhum sócio"
                    : `Mostrando ${from}–${to} de ${total} sócio${total !== 1 ? "s" : ""}`}
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

interface MembersTableProps {
    data: PaginatedResponse<MemberResponse> | undefined;
    isLoading: boolean;
    search: string;
    page: number;
    onPageChange: (page: number) => void;
    /** When provided, an edit action column is rendered for each row. Pass undefined to hide it (TREASURER). */
    onEdit?: (member: MemberResponse) => void;
}

export function MembersTable({
    data,
    isLoading,
    search,
    page,
    onPageChange,
    onEdit,
}: MembersTableProps) {
    const hasActions = !!onEdit;

    return (
        <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Lista de sócios">
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
                                Telefone
                            </th>
                            <th
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                            >
                                Plano
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
                                Desde
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
                            <EmptyState hasSearch={!!search} />
                        ) : (
                            data.data.map((member) => (
                                <tr
                                    key={member.id}
                                    className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                                >
                                    <td className="px-4 py-3 font-medium text-neutral-900">
                                        {member.name}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-neutral-700">
                                        {formatCPF(member.cpf)}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-neutral-700">
                                        {formatPhone(member.phone)}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600">
                                        {member.plans[0]?.name ?? (
                                            <span className="text-neutral-400">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <MemberStatusBadge status={member.status as MemberStatus} />
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600">
                                        {formatDate(member.joinedAt)}
                                    </td>
                                    {hasActions && (
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end items-center">
                                                <button
                                                    type="button"
                                                    onClick={() => onEdit?.(member)}
                                                    className="p-1.5 text-neutral-400 hover:text-primary-600 transition-colors rounded"
                                                    aria-label={`Editar sócio ${member.name}`}
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