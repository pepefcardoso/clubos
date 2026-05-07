"use client";

import { useState, useCallback } from "react";
import { Users, Download, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import { useFans } from "@/hooks/use-fans";
import { useAuth } from "@/hooks/use-auth";
import { fetchFans, type FanResponse } from "@/lib/api/fans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toCsv, downloadCsv, type CsvHeader, type CsvRow } from "@/lib/csv-export";
import { formatBRL, formatDateTime } from "@/lib/format";

type SortBy = "totalSpentCents" | "createdAt";
type Order = "asc" | "desc";

const CSV_HEADERS: CsvHeader[] = [
    { key: "name", label: "Nome" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Telefone" },
    { key: "totalSpentBRL", label: "Gasto Total (R$)" },
    { key: "eventCount", label: "Eventos" },
    { key: "createdAt", label: "Cadastro" },
];

function SortIcon({ column, sortBy, order }: { column: SortBy; sortBy: SortBy; order: Order }) {
    if (column !== sortBy) return <ArrowUpDown size={12} className="ml-1 inline text-neutral-400" aria-hidden="true" />;
    return order === "asc"
        ? <ArrowUp size={12} className="ml-1 inline text-primary-600" aria-hidden="true" />
        : <ArrowDown size={12} className="ml-1 inline text-primary-600" aria-hidden="true" />;
}

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-100">
                    {Array.from({ length: 6 }).map((_, j) => (
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
            <td colSpan={6}>
                <div className="flex flex-col items-center gap-2 py-12">
                    <Users size={48} className="text-neutral-300" aria-hidden="true" />
                    <p className="font-medium text-neutral-600">Nenhum torcedor encontrado</p>
                    <p className="text-sm text-neutral-500">
                        {hasSearch
                            ? "Tente buscar por outro nome, email ou telefone."
                            : "Os torcedores aparecem aqui após comprar ingressos."}
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
    onPageChange: (p: number) => void;
}

function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
    const totalPages = Math.ceil(total / limit);
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    return (
        <div className="flex items-center justify-between px-1 py-3">
            <p className="text-sm text-neutral-500">
                {total === 0
                    ? "Nenhum torcedor"
                    : `Mostrando ${from}–${to} de ${total} torcedor${total !== 1 ? "es" : ""}`}
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

function toExportRow(f: FanResponse): CsvRow {
    return {
        name: f.name,
        email: f.email,
        phone: f.phone ?? "",
        totalSpentBRL: (f.totalSpentCents / 100).toFixed(2),
        eventCount: f.eventCount,
        createdAt: new Intl.DateTimeFormat("pt-BR").format(new Date(f.createdAt)),
    };
}

export function FanProfilesPage() {
    const { getAccessToken } = useAuth();

    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [sortBy, setSortBy] = useState<SortBy>("createdAt");
    const [order, setOrder] = useState<Order>("desc");
    const [isExporting, setIsExporting] = useState(false);

    const debouncedSearch = useDebouncedValue(search, 300);

    const { data, isLoading } = useFans({
        page,
        limit: 20,
        search: debouncedSearch,
        sortBy,
        order,
    });

    const handleSearchChange = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const toggleSort = useCallback(
        (col: SortBy) => {
            if (col === sortBy) {
                setOrder((prev) => (prev === "desc" ? "asc" : "desc"));
            } else {
                setSortBy(col);
                setOrder("desc");
            }
            setPage(1);
        },
        [sortBy],
    );

    const handleExport = useCallback(async () => {
        setIsExporting(true);
        try {
            const token = await getAccessToken();
            if (!token) return;

            const full = await fetchFans(
                { limit: 1000, page: 1, search: debouncedSearch, sortBy, order },
                token,
            );

            const csv = toCsv(full.data.map(toExportRow), CSV_HEADERS);
            const date = new Intl.DateTimeFormat("pt-BR").format(new Date()).replace(/\//g, "-");
            downloadCsv(csv, `torcedores-${date}.csv`);
        } finally {
            setIsExporting(false);
        }
    }, [getAccessToken, debouncedSearch, sortBy, order]);

    return (
        <div className="px-6 py-8 max-w-7xl mx-auto">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Torcedores</h1>
                    <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                        CRM de torcedores que compraram ingressos.
                    </p>
                </div>

                <Button
                    variant="secondary"
                    onClick={handleExport}
                    disabled={isExporting || !data || data.total === 0}
                    aria-label="Exportar lista de torcedores em CSV"
                >
                    <Download size={15} aria-hidden="true" />
                    {isExporting ? "Exportando…" : "Exportar CSV"}
                </Button>
            </div>

            <div className="mb-4">
                <div className="relative max-w-sm">
                    <label htmlFor="fan-search" className="sr-only">
                        Buscar torcedores
                    </label>
                    <Search
                        size={15}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                        aria-hidden="true"
                    />
                    <Input
                        id="fan-search"
                        type="search"
                        placeholder="Buscar por nome, email ou telefone…"
                        value={search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-label="Lista de torcedores">
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
                                    Email
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
                                    Eventos
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    <button
                                        type="button"
                                        onClick={() => toggleSort("totalSpentCents")}
                                        className="inline-flex items-center hover:text-neutral-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                                        aria-label={`Ordenar por gasto total ${sortBy === "totalSpentCents" && order === "desc" ? "crescente" : "decrescente"}`}
                                    >
                                        Gasto total
                                        <SortIcon column="totalSpentCents" sortBy={sortBy} order={order} />
                                    </button>
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide"
                                >
                                    <button
                                        type="button"
                                        onClick={() => toggleSort("createdAt")}
                                        className="inline-flex items-center hover:text-neutral-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                                        aria-label={`Ordenar por data de cadastro ${sortBy === "createdAt" && order === "desc" ? "crescente" : "decrescente"}`}
                                    >
                                        Cadastro
                                        <SortIcon column="createdAt" sortBy={sortBy} order={order} />
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <SkeletonRows />
                            ) : !data || data.data.length === 0 ? (
                                <EmptyState hasSearch={!!debouncedSearch} />
                            ) : (
                                data.data.map((fan) => (
                                    <tr
                                        key={fan.id}
                                        className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
                                    >
                                        <td className="px-4 py-3 font-medium text-neutral-900">{fan.name}</td>
                                        <td className="px-4 py-3 text-neutral-700">{fan.email}</td>
                                        <td className="px-4 py-3 text-neutral-600">
                                            {fan.phone ?? <span className="text-neutral-400">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-600">{fan.eventCount}</td>
                                        <td className="px-4 py-3 font-mono text-neutral-900">
                                            {formatBRL(fan.totalSpentCents)}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-600">
                                            {formatDateTime(fan.createdAt)}
                                        </td>
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
                            onPageChange={setPage}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}