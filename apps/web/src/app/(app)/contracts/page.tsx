import type { Metadata } from 'next';
import { ContractsPage } from '@/components/contracts/ContractsPage';

export const metadata: Metadata = {
    title: 'Contratos — ClubOS',
};

export default function Page() {
    return <ContractsPage />;
}