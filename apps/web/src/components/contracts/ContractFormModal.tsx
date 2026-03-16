'use client';

import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateContract, useUpdateContract } from '@/hooks/use-contracts';
import { ApiError, type ContractResponse, type ContractType, type ContractStatus } from '@/lib/api/contracts';
import type { AthleteResponse } from '@/lib/api/athletes';

const TYPE_OPTIONS: Array<{ value: ContractType; label: string }> = [
    { value: 'PROFESSIONAL', label: 'Profissional' },
    { value: 'AMATEUR', label: 'Amador' },
    { value: 'FORMATIVE', label: 'Formativo' },
    { value: 'LOAN', label: 'Empréstimo' },
];

const STATUS_OPTIONS: Array<{ value: ContractStatus; label: string }> = [
    { value: 'ACTIVE', label: 'Ativo' },
    { value: 'EXPIRED', label: 'Expirado' },
    { value: 'SUSPENDED', label: 'Suspenso' },
    { value: 'TERMINATED', label: 'Encerrado' },
];

function toDateInputValue(iso: string | null): string {
    if (!iso) return '';
    return iso.split('T')[0];
}

interface FormState {
    athleteId: string;
    type: ContractType | '';
    status: ContractStatus;
    startDate: string;
    endDate: string;
    bidRegistered: boolean;
    federationCode: string;
    notes: string;
}

interface FormErrors {
    athleteId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
}

function validate(form: FormState, isEditing: boolean): FormErrors {
    const e: FormErrors = {};

    if (!isEditing && !form.athleteId) {
        e.athleteId = 'Selecione o atleta';
    }
    if (!isEditing && !form.type) {
        e.type = 'Selecione o tipo de contrato';
    }
    if (!form.startDate) {
        e.startDate = 'Informe a data de início';
    }
    if (form.endDate && form.startDate && form.endDate < form.startDate) {
        e.endDate = 'Data de término deve ser posterior ao início';
    }

    return e;
}

function Field({
    label,
    required,
    error,
    hint,
    htmlFor,
    children,
}: {
    label: string;
    required?: boolean;
    error?: string;
    hint?: string;
    htmlFor: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={htmlFor}>
                {label}
                {required && (
                    <span className="text-danger ml-0.5" aria-hidden="true">
                        *
                    </span>
                )}
            </Label>
            {hint && <p className="text-xs text-neutral-400">{hint}</p>}
            {children}
            {error && (
                <p className="text-sm text-danger" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}

function Spinner() {
    return (
        <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
        >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    );
}

const selectClassName =
    'w-full h-9 rounded border border-neutral-300 bg-white px-3 py-1 text-[0.9375rem] text-neutral-900 transition-colors focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500';

interface ContractFormModalProps {
    contract?: ContractResponse | null;
    athletes: AthleteResponse[];
    onClose: () => void;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}

export function ContractFormModal({
    contract,
    athletes,
    onClose,
    onSuccess,
    onError,
}: ContractFormModalProps) {
    const isEditing = !!contract;
    const isTerminated = contract?.status === 'TERMINATED';

    const createMutation = useCreateContract();
    const updateMutation = useUpdateContract();

    const [form, setForm] = useState<FormState>({
        athleteId: '',
        type: '',
        status: (contract?.status as ContractStatus) ?? 'ACTIVE',
        startDate: toDateInputValue(contract?.startDate ?? null),
        endDate: toDateInputValue(contract?.endDate ?? null),
        bidRegistered: contract?.bidRegistered ?? false,
        federationCode: contract?.federationCode ?? '',
        notes: contract?.notes ?? '',
    });

    const [errors, setErrors] = useState<FormErrors>({});
    const [inlineError, setInlineError] = useState<string | null>(null);

    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
        setForm((prev) => ({ ...prev, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const validationErrors = validate(form, isEditing);
        setErrors(validationErrors);
        if (Object.keys(validationErrors).length > 0) return;

        setInlineError(null);

        try {
            if (isEditing && contract) {
                await updateMutation.mutateAsync({
                    contractId: contract.id,
                    payload: {
                        status: form.status,
                        endDate: form.endDate || null,
                        bidRegistered: form.bidRegistered,
                        federationCode: form.federationCode.trim() || null,
                        notes: form.notes.trim() || null,
                    },
                });
                onSuccess('Contrato atualizado com sucesso');
            } else {
                await createMutation.mutateAsync({
                    athleteId: form.athleteId,
                    type: form.type as ContractType,
                    startDate: form.startDate,
                    endDate: form.endDate || undefined,
                    bidRegistered: form.bidRegistered,
                    federationCode: form.federationCode.trim() || undefined,
                    notes: form.notes.trim() || undefined,
                });
                const athleteName = athletes.find((a) => a.id === form.athleteId)?.name ?? '';
                onSuccess(`Contrato criado para ${athleteName}`);
            }
            onClose();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setInlineError(
                    'Atleta já possui um contrato ativo. Encerre o contrato atual antes de criar um novo.',
                );
            } else if (err instanceof ApiError && err.status === 422) {
                setInlineError('Este contrato está encerrado e não pode ser alterado.');
            } else {
                onError('Não foi possível salvar o contrato. Tente novamente.');
            }
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-modal-title"
        >
            <div className="relative w-full max-w-lg mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <h2
                        id="contract-modal-title"
                        className="text-lg font-semibold text-neutral-900"
                    >
                        {isEditing ? 'Editar contrato' : 'Novo contrato'}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="text-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-50"
                        aria-label="Fechar modal"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                {isTerminated && (
                    <div className="mx-6 mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                        <p className="text-sm text-amber-800">
                            Este contrato está encerrado e não pode ser alterado.
                        </p>
                    </div>
                )}

                {inlineError && (
                    <div className="mx-6 mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3">
                        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-danger" aria-hidden="true" />
                        <p className="text-sm text-danger" role="alert">
                            {inlineError}
                        </p>
                    </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                    <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
                        {!isEditing && (
                            <>
                                <Field label="Atleta" required error={errors.athleteId} htmlFor="c-athlete">
                                    <select
                                        id="c-athlete"
                                        value={form.athleteId}
                                        disabled={isSubmitting}
                                        onChange={(e) => set('athleteId', e.target.value)}
                                        className={selectClassName}
                                        aria-label="Selecionar atleta"
                                        aria-invalid={!!errors.athleteId}
                                    >
                                        <option value="">— Selecione um atleta —</option>
                                        {athletes
                                            .filter((a) => a.status === 'ACTIVE')
                                            .map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.name}
                                                    {a.position ? ` — ${a.position}` : ''}
                                                </option>
                                            ))}
                                    </select>
                                </Field>

                                <Field label="Tipo de vínculo" required error={errors.type} htmlFor="c-type">
                                    <select
                                        id="c-type"
                                        value={form.type}
                                        disabled={isSubmitting}
                                        onChange={(e) => set('type', e.target.value as ContractType)}
                                        className={selectClassName}
                                        aria-label="Selecionar tipo de contrato"
                                        aria-invalid={!!errors.type}
                                    >
                                        <option value="">— Selecione o tipo —</option>
                                        {TYPE_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            </>
                        )}

                        {isEditing && (
                            <Field label="Status" htmlFor="c-status">
                                <select
                                    id="c-status"
                                    value={form.status}
                                    disabled={isSubmitting || isTerminated}
                                    onChange={(e) => set('status', e.target.value as ContractStatus)}
                                    className={selectClassName}
                                    aria-label="Selecionar status do contrato"
                                >
                                    {STATUS_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                                {form.status === 'TERMINATED' && (
                                    <p className="text-xs text-danger mt-1">
                                        ⚠️ Esta ação é irreversível. O contrato não poderá ser alterado após encerrado.
                                    </p>
                                )}
                            </Field>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <Field
                                label="Data de início"
                                required={!isEditing}
                                error={errors.startDate}
                                htmlFor="c-start"
                            >
                                <Input
                                    id="c-start"
                                    type="date"
                                    value={form.startDate}
                                    disabled={isSubmitting || isTerminated || isEditing}
                                    aria-invalid={!!errors.startDate}
                                    onChange={(e) => set('startDate', e.target.value)}
                                />
                            </Field>

                            <Field
                                label="Data de término"
                                error={errors.endDate}
                                htmlFor="c-end"
                                hint="Opcional"
                            >
                                <Input
                                    id="c-end"
                                    type="date"
                                    value={form.endDate}
                                    disabled={isSubmitting || isTerminated}
                                    aria-invalid={!!errors.endDate}
                                    onChange={(e) => set('endDate', e.target.value)}
                                />
                            </Field>
                        </div>

                        <div className="flex items-center gap-3">
                            <input
                                id="c-bid"
                                type="checkbox"
                                checked={form.bidRegistered}
                                disabled={isSubmitting || isTerminated}
                                onChange={(e) => set('bidRegistered', e.target.checked)}
                                className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed"
                            />
                            <Label htmlFor="c-bid" className="cursor-pointer">
                                BID registrado na CBF/Federação
                            </Label>
                        </div>

                        <Field
                            label="Código de federação"
                            htmlFor="c-fed"
                            hint="Opcional — máx. 100 caracteres"
                        >
                            <Input
                                id="c-fed"
                                type="text"
                                maxLength={100}
                                value={form.federationCode}
                                disabled={isSubmitting || isTerminated}
                                placeholder="Ex: FPF-2025-00123"
                                onChange={(e) => set('federationCode', e.target.value)}
                            />
                        </Field>

                        <div className="space-y-1.5">
                            <Label htmlFor="c-notes">Observações</Label>
                            <p className="text-xs text-neutral-400">Opcional — máx. 1000 caracteres</p>
                            <textarea
                                id="c-notes"
                                value={form.notes}
                                maxLength={1000}
                                disabled={isSubmitting || isTerminated}
                                placeholder="Informações adicionais sobre o contrato..."
                                rows={3}
                                onChange={(e) => set('notes', e.target.value)}
                                className="flex w-full rounded border border-neutral-300 bg-white px-3 py-2 text-[0.9375rem] text-neutral-900 placeholder:text-neutral-400 transition-colors focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500 resize-none"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </Button>
                        {!isTerminated && (
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <span className="flex items-center gap-2">
                                        <Spinner />
                                        Salvando…
                                    </span>
                                ) : isEditing ? (
                                    'Salvar alterações'
                                ) : (
                                    'Criar contrato'
                                )}
                            </Button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}