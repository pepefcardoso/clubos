"use client";

import { Search } from "lucide-react";
import type { MemberStatus } from "../../../../../packages/shared-types/src/index.js";
import { Input } from "@/components/ui/input";

const STATUS_OPTIONS: Array<{ value: MemberStatus | ""; label: string }> = [
    { value: "", label: "Todos os status" },
    { value: "ACTIVE", label: "Adimplente" },
    { value: "INACTIVE", label: "Inativo" },
    { value: "OVERDUE", label: "Inadimplente" },
];

interface MembersFiltersProps {
    search: string;
    status: MemberStatus | "";
    onSearchChange: (value: string) => void;
    onStatusChange: (value: MemberStatus | "") => void;
}

export function MembersFilters({
    search,
    status,
    onSearchChange,
    onStatusChange,
}: MembersFiltersProps) {
    return (
        <div className="flex gap-3 items-center">
            <div className="relative flex-1">
                <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                    aria-hidden="true"
                />
                <Input
                    type="search"
                    placeholder="Buscar por nome ou CPF..."
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-9"
                    aria-label="Buscar sócios por nome ou CPF"
                />
            </div>

            <select
                value={status}
                onChange={(e) => onStatusChange(e.target.value as MemberStatus | "")}
                className="h-9 w-44 rounded border border-neutral-300 bg-white px-3 py-1 text-[0.9375rem] text-neutral-900
          transition-colors focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2
          focus-visible:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500"
                aria-label="Filtrar por status"
            >
                {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
}