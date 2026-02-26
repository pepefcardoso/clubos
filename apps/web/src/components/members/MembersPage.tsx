"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, CheckCircle, XCircle } from "lucide-react";
import type { MemberStatus } from "../../../../../packages/shared-types/src/index.js";
import { useAuth } from "@/hooks/use-auth";
import { fetchMembers, type MemberResponse } from "@/lib/api/members";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MembersFilters } from "./MembersFilters";
import { MembersTable } from "./MembersTable";
import { MemberFormModal } from "./MemberFormModal";

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

export function MembersPage() {
    const { getAccessToken, user } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<MemberStatus | "">("");
    const [page, setPage] = useState(1);

    const [formTarget, setFormTarget] = useState<MemberResponse | "new" | null>(null);

    const { toasts, pushSuccess, pushError } = useToasts();

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
                    <Button onClick={() => setFormTarget("new")}>
                        <Plus size={16} aria-hidden="true" />
                        Novo sócio
                    </Button>
                )}
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
                onEdit={isAdmin ? (member) => setFormTarget(member) : undefined}
            />

            {formTarget !== null && (
                <MemberFormModal
                    member={formTarget === "new" ? null : formTarget}
                    onClose={() => setFormTarget(null)}
                    onSuccess={pushSuccess}
                    onError={pushError}
                />
            )}

            <ToastContainer toasts={toasts} />
        </div>
    );
}