import type { ContractStatus } from '@/lib/api/contracts';

const STATUS_CONFIG: Record<ContractStatus, { label: string; className: string }> = {
    ACTIVE: {
        label: 'Ativo',
        className: 'bg-primary-50 text-primary-700',
    },
    EXPIRED: {
        label: 'Expirado',
        className: 'bg-neutral-100 text-neutral-600',
    },
    TERMINATED: {
        label: 'Encerrado',
        className: 'bg-red-50 text-red-700',
    },
    SUSPENDED: {
        label: 'Suspenso',
        className: 'bg-amber-50 text-amber-700',
    },
};

interface ContractStatusBadgeProps {
    status: ContractStatus;
}

export function ContractStatusBadge({ status }: ContractStatusBadgeProps) {
    const config = STATUS_CONFIG[status];
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
        >
            {config.label}
        </span>
    );
}