'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useContracts } from '@/hooks/use-contracts';
import { ATHLETES_QUERY_KEY } from '@/hooks/use-athletes';
import { fetchAthletes, type AthleteResponse } from '@/lib/api/athletes';
import type { ContractResponse, ContractStatus } from '@/lib/api/contracts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ContractsTable } from './ContractsTable';
import { ContractFormModal } from './ContractFormModal';

const STATUS_OPTIONS: Array<{ value: ContractStatus | ''; label: string }> = [
    { value: '', label: 'Todos os status' },
    { value: 'ACTIVE', label: 'Ativo' },
    { value: 'EXPIRED', label: 'Expirado' },
    { value: 'TERMINATED', label: 'Encerrado' },
    { value: 'SUSPENDED', label: 'Suspenso' },
];

interface Toast {
    id: number;
    type: 'success' | 'error';
    message: string;
}

let toastCounter = 0;

function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const push = (type: Toast['type'], message: string) => {
        const id = ++toastCounter;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(
            () => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            },
            type === 'success' ? 3000 : 6000,
        );
    };

    return {
        toasts,
        pushSuccess: (msg: string) => push('success', msg),
        pushError: (msg: string) => push('error', msg),
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
                        'flex items-start gap-3 min-w-[280px] max-w-sm rounded-md border-l-4 bg-white px-4 py-3 shadow-lg',
                        toast.type === 'success' ? 'border-primary-500' : 'border-danger',
                    )}
                >
                    {toast.type === 'success' ? (
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

export function ContractsPage() {
    const { getAccessToken, user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';

    const [status, setStatus] = useState<ContractStatus | ''>('');
    const [page, setPage] = useState(1);
    const [formTarget, setFormTarget] = useState<ContractResponse | 'new' | null>(null);

    const { toasts, pushSuccess, pushError } = useToasts();

    const handleStatusChange = (value: ContractStatus | '') => {
        setStatus(value);
        setPage(1);
    };

    const { data, isLoading } = useContracts({
        status: status || undefined,
        page,
        limit: 20,
    });

    const { data: athletesData } = useQuery({
        queryKey: [...ATHLETES_QUERY_KEY, { limit: 200 }],
        queryFn: async () => {
            const token = await getAccessToken();
            if (!token) throw new Error('Não autenticado');
            return fetchAthletes({ limit: 200 }, token);
        },
        staleTime: 60_000,
    });

    const athletes: AthleteResponse[] = useMemo(
        () => athletesData?.data ?? [],
        [athletesData],
    );

    return (
        <div className="px-6 py-8 max-w-7xl mx-auto">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Contratos</h1>
                    <p className="text-neutral-500 mt-1 text-[0.9375rem]">
                        Gerencie os vínculos contratuais dos atletas do clube.
                    </p>
                </div>

                {isAdmin && (
                    <Button onClick={() => setFormTarget('new')}>
                        <Plus size={16} aria-hidden="true" />
                        Novo contrato
                    </Button>
                )}
            </div>

            <div className="mb-4">
                <select
                    value={status}
                    onChange={(e) => handleStatusChange(e.target.value as ContractStatus | '')}
                    className="h-9 w-48 rounded border border-neutral-300 bg-white px-3 py-1 text-[0.9375rem] text-neutral-900 transition-colors focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20"
                    aria-label="Filtrar por status"
                >
                    {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>

            <ContractsTable
                data={data}
                athletes={athletes}
                isLoading={isLoading}
                page={page}
                onPageChange={setPage}
                onEdit={isAdmin ? (contract) => setFormTarget(contract) : undefined}
            />

            {formTarget !== null && (
                <ContractFormModal
                    key={formTarget === 'new' ? 'new' : formTarget.id}
                    contract={formTarget === 'new' ? null : formTarget}
                    athletes={athletes}
                    onClose={() => setFormTarget(null)}
                    onSuccess={pushSuccess}
                    onError={pushError}
                />
            )}

            <ToastContainer toasts={toasts} />
        </div>
    );
}