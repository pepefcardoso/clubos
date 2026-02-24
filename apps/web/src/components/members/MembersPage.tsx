"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MemberStatus } from "../../../../../packages/shared-types/src/index.js";
import { useAuth } from "@/hooks/use-auth";
import { fetchMembers } from "@/lib/api/members";
import { MembersFilters } from "./MembersFilters";
import { MembersTable } from "./MembersTable";

function useDebouncedValue<T>(value: T, delay: number): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}

export function MembersPage() {
    const { getAccessToken } = useAuth();

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<MemberStatus | "">("");
    const [page, setPage] = useState(1);

    const debouncedSearch = useDebouncedValue(search, 300);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, status]);

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
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                    Sócios
                </h1>
                <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                    Gerencie o cadastro de sócios do clube.
                </p>
            </div>

            <div className="mb-4">
                <MembersFilters
                    search={search}
                    status={status}
                    onSearchChange={setSearch}
                    onStatusChange={setStatus}
                />
            </div>

            <MembersTable
                data={data}
                isLoading={isLoading}
                search={debouncedSearch}
                page={page}
                onPageChange={setPage}
            />
        </div>
    );
}