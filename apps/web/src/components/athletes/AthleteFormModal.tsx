"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateAthlete, useUpdateAthlete } from "@/hooks/use-athletes";
import { ApiError, type AthleteResponse, type AthleteStatus } from "@/lib/api/athletes";
import { Spinner } from "../ui/spinner";

interface AthleteFormModalProps {
    athlete?: AthleteResponse | null;
    onClose: () => void;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}

interface FormState {
    name: string;
    cpf: string;
    birthDate: string;
    position: string;
    status: AthleteStatus;
}

interface FormErrors {
    name?: string;
    cpf?: string;
    birthDate?: string;
    position?: string;
}

const stripNonDigits = (v: string) => v.replace(/\D/g, "");

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

export function AthleteFormModal({
    athlete,
    onClose,
    onSuccess,
    onError,
}: AthleteFormModalProps) {
    const isEditing = !!athlete;
    const createMutation = useCreateAthlete();
    const updateMutation = useUpdateAthlete();

    const [form, setForm] = useState<FormState>({
        name: athlete?.name ?? "",
        cpf: "",
        birthDate: athlete?.birthDate
            ? new Date(athlete.birthDate).toISOString().slice(0, 10)
            : "",
        position: athlete?.position ?? "",
        status: athlete?.status ?? "ACTIVE",
    });

    const [errors, setErrors] = useState<FormErrors>({});

    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
        setForm((prev) => ({ ...prev, [k]: v }));

    const validateBirthDate = (value: string): string | undefined => {
        if (!value) return "Informe a data de nascimento";
        const date = new Date(value);
        if (isNaN(date.getTime())) return "Data inválida";
        if (date > new Date()) return "Data de nascimento não pode ser futura";
        return undefined;
    };

    const validate = (): boolean => {
        const e: FormErrors = {};

        if (!form.name.trim()) {
            e.name = "Informe o nome do atleta";
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

        const birthDateError = validateBirthDate(form.birthDate);
        if (birthDateError) e.birthDate = birthDateError;

        if (form.position && form.position.length > 60) {
            e.position = "Posição deve ter no máximo 60 caracteres";
        }

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        try {
            if (isEditing && athlete) {
                await updateMutation.mutateAsync({
                    athleteId: athlete.id,
                    payload: {
                        name: form.name.trim(),
                        birthDate: form.birthDate,
                        position: form.position.trim() || null,
                        status: form.status,
                    },
                });
                onSuccess(`Atleta "${form.name.trim()}" atualizado com sucesso`);
            } else {
                await createMutation.mutateAsync({
                    name: form.name.trim(),
                    cpf: form.cpf,
                    birthDate: form.birthDate,
                    position: form.position.trim() || undefined,
                });
                onSuccess(`Atleta "${form.name.trim()}" cadastrado com sucesso`);
            }
            onClose();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setErrors((prev) => ({
                    ...prev,
                    cpf: "Atleta com este CPF já está cadastrado",
                }));
            } else {
                onError("Não foi possível salvar o atleta. Tente novamente.");
            }
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="athlete-modal-title"
        >
            <div className="relative w-full max-w-lg mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <h2
                        id="athlete-modal-title"
                        className="text-lg font-semibold text-neutral-900"
                    >
                        {isEditing ? "Editar atleta" : "Novo atleta"}
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
                        <Field label="Nome" required error={errors.name} htmlFor="a-name">
                            <Input
                                id="a-name"
                                type="text"
                                value={form.name}
                                maxLength={120}
                                disabled={isSubmitting}
                                placeholder="Ex: Carlos Eduardo"
                                aria-invalid={!!errors.name}
                                onChange={(e) => set("name", e.target.value)}
                            />
                        </Field>

                        {!isEditing && (
                            <Field
                                label="CPF"
                                required
                                error={errors.cpf}
                                htmlFor="a-cpf"
                                hint="Apenas números, sem máscara"
                            >
                                <Input
                                    id="a-cpf"
                                    inputMode="numeric"
                                    maxLength={11}
                                    disabled={isSubmitting}
                                    value={form.cpf}
                                    placeholder="12345678900"
                                    aria-invalid={!!errors.cpf}
                                    className="font-mono max-w-[200px]"
                                    onChange={(e) => set("cpf", stripNonDigits(e.target.value))}
                                />
                            </Field>
                        )}

                        <Field
                            label="Data de Nascimento"
                            required
                            error={errors.birthDate}
                            htmlFor="a-birthdate"
                        >
                            <Input
                                id="a-birthdate"
                                type="date"
                                disabled={isSubmitting}
                                value={form.birthDate}
                                aria-invalid={!!errors.birthDate}
                                className="max-w-[200px]"
                                onChange={(e) => set("birthDate", e.target.value)}
                            />
                        </Field>

                        <Field
                            label="Posição"
                            error={errors.position}
                            htmlFor="a-position"
                        >
                            <Input
                                id="a-position"
                                type="text"
                                value={form.position}
                                maxLength={60}
                                disabled={isSubmitting}
                                placeholder="Ex: Atacante, Goleiro..."
                                aria-invalid={!!errors.position}
                                onChange={(e) => set("position", e.target.value)}
                            />
                        </Field>

                        {isEditing && (
                            <div className="space-y-1.5">
                                <Label htmlFor="a-status">Status</Label>
                                <select
                                    id="a-status"
                                    value={form.status}
                                    disabled={isSubmitting}
                                    onChange={(e) => set("status", e.target.value as AthleteStatus)}
                                    className="w-full h-9 rounded border border-neutral-300 bg-white px-3 py-1
                    text-[0.9375rem] text-neutral-900 transition-colors
                    focus-visible:outline-none focus-visible:border-primary-500
                    focus-visible:ring-2 focus-visible:ring-primary-500/20
                    disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500"
                                    aria-label="Selecionar status"
                                >
                                    <option value="ACTIVE">Ativo</option>
                                    <option value="INACTIVE">Inativo</option>
                                    <option value="SUSPENDED">Suspenso</option>
                                </select>
                            </div>
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
                                "Cadastrar atleta"
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}