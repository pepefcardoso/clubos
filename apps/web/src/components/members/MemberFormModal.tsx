"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateMember, useUpdateMember } from "@/hooks/use-members";
import { usePlans } from "@/hooks/use-plans";
import { formatBRL } from "@/lib/format";
import { ApiError, type MemberResponse } from "@/lib/api/members";

interface MemberFormModalProps {
    member?: MemberResponse | null;
    onClose: () => void;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}

interface FormState {
    name: string;
    cpf: string;
    phone: string;
    email: string;
    planId: string;
    joinedAt: string;
}

interface FormErrors {
    name?: string;
    cpf?: string;
    phone?: string;
    email?: string;
}

const stripNonDigits = (v: string) => v.replace(/\D/g, "");

const todayIso = () => new Date().toISOString().slice(0, 10);

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
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
        </svg>
    );
}

export function MemberFormModal({
    member,
    onClose,
    onSuccess,
    onError,
}: MemberFormModalProps) {
    const isEditing = !!member;
    const createMutation = useCreateMember();
    const updateMutation = useUpdateMember();

    const { data: plans = [] } = usePlans();
    const activePlans = plans.filter((p) => p.isActive);

    const [form, setForm] = useState<FormState>(() => ({
        name: member?.name ?? "",
        cpf: "",
        phone: member?.phone?.replace(/\D/g, "") ?? "",
        email: member?.email ?? "",
        planId: member?.plans[0]?.id ?? "",
        joinedAt: todayIso(),
    }));

    const [errors, setErrors] = useState<FormErrors>({});

    useEffect(() => {
        setForm({
            name: member?.name ?? "",
            cpf: "",
            phone: member?.phone?.replace(/\D/g, "") ?? "",
            email: member?.email ?? "",
            planId: member?.plans[0]?.id ?? "",
            joinedAt: todayIso(),
        });
        setErrors({});
    }, [member]);

    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
        setForm((prev) => ({ ...prev, [k]: v }));

    const validate = (): boolean => {
        const e: FormErrors = {};

        if (!form.name.trim()) {
            e.name = "Informe o nome do sócio";
        } else if (form.name.trim().length < 2) {
            e.name = "Nome deve ter pelo menos 2 caracteres";
        } else if (form.name.trim().length > 120) {
            e.name = "Nome deve ter no máximo 120 caracteres";
        }

        if (!isEditing) {
            if (!form.cpf) {
                e.cpf = "Informe o CPF";
            } else if (form.cpf.length !== 11) {
                e.cpf = "CPF deve ter exatamente 11 dígitos";
            }
        }

        if (!form.phone) {
            e.phone = "Informe o telefone";
        } else if (form.phone.length < 10 || form.phone.length > 11) {
            e.phone = "Telefone deve ter 10 ou 11 dígitos";
        }

        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
            e.email = "Informe um e-mail válido";
        }

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        try {
            if (isEditing && member) {
                await updateMutation.mutateAsync({
                    memberId: member.id,
                    payload: {
                        name: form.name.trim(),
                        phone: form.phone,
                        email: form.email.trim() || null,
                        planId: form.planId || null,
                    },
                });
                onSuccess(`Sócio "${form.name.trim()}" atualizado com sucesso`);
            } else {
                await createMutation.mutateAsync({
                    name: form.name.trim(),
                    cpf: form.cpf,
                    phone: form.phone,
                    email: form.email.trim() || undefined,
                    planId: form.planId || undefined,
                    joinedAt: new Date(form.joinedAt).toISOString(),
                });
                onSuccess(`Sócio "${form.name.trim()}" cadastrado com sucesso`);
            }
            onClose();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setErrors((prev) => ({ ...prev, cpf: "CPF já cadastrado neste clube" }));
            } else {
                onError("Não foi possível salvar o sócio. Tente novamente.");
            }
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-modal-title"
        >
            <div className="relative w-full max-w-lg mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <h2
                        id="member-modal-title"
                        className="text-lg font-semibold text-neutral-900"
                    >
                        {isEditing ? "Editar sócio" : "Novo sócio"}
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

                <form onSubmit={handleSubmit} noValidate>
                    <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                        <Field label="Nome" required error={errors.name} htmlFor="m-name">
                            <Input
                                id="m-name"
                                type="text"
                                value={form.name}
                                maxLength={120}
                                disabled={isSubmitting}
                                placeholder="Ex: João da Silva"
                                aria-invalid={!!errors.name}
                                aria-describedby={errors.name ? "m-name-err" : undefined}
                                onChange={(e) => set("name", e.target.value)}
                            />
                        </Field>

                        {!isEditing && (
                            <Field
                                label="CPF"
                                required
                                error={errors.cpf}
                                htmlFor="m-cpf"
                                hint="Apenas números, sem máscara"
                            >
                                <Input
                                    id="m-cpf"
                                    inputMode="numeric"
                                    maxLength={11}
                                    disabled={isSubmitting}
                                    value={form.cpf}
                                    placeholder="12345678900"
                                    aria-invalid={!!errors.cpf}
                                    aria-describedby={errors.cpf ? "m-cpf-err" : undefined}
                                    className="font-mono max-w-[200px]"
                                    onChange={(e) => set("cpf", stripNonDigits(e.target.value))}
                                />
                            </Field>
                        )}

                        <Field
                            label="Telefone"
                            required
                            error={errors.phone}
                            htmlFor="m-phone"
                            hint="DDD + número, sem máscara"
                        >
                            <Input
                                id="m-phone"
                                inputMode="tel"
                                maxLength={11}
                                disabled={isSubmitting}
                                value={form.phone}
                                placeholder="11999990000"
                                aria-invalid={!!errors.phone}
                                aria-describedby={errors.phone ? "m-phone-err" : undefined}
                                className="font-mono max-w-[200px]"
                                onChange={(e) => set("phone", stripNonDigits(e.target.value))}
                            />
                        </Field>

                        <Field label="E-mail" error={errors.email} htmlFor="m-email">
                            <Input
                                id="m-email"
                                type="email"
                                disabled={isSubmitting}
                                value={form.email}
                                placeholder="joao@email.com"
                                aria-invalid={!!errors.email}
                                aria-describedby={errors.email ? "m-email-err" : undefined}
                                onChange={(e) => set("email", e.target.value)}
                            />
                        </Field>

                        <div className="space-y-1.5">
                            <Label htmlFor="m-plan">Plano</Label>
                            <select
                                id="m-plan"
                                value={form.planId}
                                disabled={isSubmitting}
                                onChange={(e) => set("planId", e.target.value)}
                                className="w-full h-9 rounded border border-neutral-300 bg-white px-3 py-1
                  text-[0.9375rem] text-neutral-900 transition-colors
                  focus-visible:outline-none focus-visible:border-primary-500
                  focus-visible:ring-2 focus-visible:ring-primary-500/20
                  disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500"
                                aria-label="Selecionar plano"
                            >
                                <option value="">— Sem plano —</option>
                                {activePlans.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} — {formatBRL(p.priceCents)}/{p.interval === "monthly" ? "mês" : p.interval === "quarterly" ? "trim." : "ano"}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {!isEditing && (
                            <Field label="Data de entrada" htmlFor="m-joined">
                                <Input
                                    id="m-joined"
                                    type="date"
                                    disabled={isSubmitting}
                                    value={form.joinedAt}
                                    onChange={(e) => set("joinedAt", e.target.value)}
                                    className="max-w-[200px]"
                                />
                            </Field>
                        )}
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
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <Spinner />
                                    Salvando…
                                </span>
                            ) : isEditing ? (
                                "Salvar alterações"
                            ) : (
                                "Cadastrar sócio"
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}