"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
    formatBRL,
    parsePriceToCents,
    centsToInputValue,
} from "@/lib/format";
import {
    useCreatePlan,
    useUpdatePlan,
} from "@/hooks/use-plans";
import { ApiError, type PlanResponse } from "@/lib/api/plans";

type PlanInterval = "monthly" | "quarterly" | "annual";

interface PlanFormModalProps {
    plan?: PlanResponse | null;
    onClose: () => void;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}

interface FormState {
    name: string;
    price: string;
    interval: PlanInterval;
    benefits: string[];
}

interface FormErrors {
    name?: string;
    price?: string;
}

const INTERVAL_OPTIONS: Array<{ value: PlanInterval; label: string }> = [
    { value: "monthly", label: "Mensal" },
    { value: "quarterly", label: "Trimestral" },
    { value: "annual", label: "Anual" },
];

export function PlanFormModal({
    plan,
    onClose,
    onSuccess,
    onError,
}: PlanFormModalProps) {
    const isEditing = !!plan;
    const createMutation = useCreatePlan();
    const updateMutation = useUpdatePlan();

    const [form, setForm] = useState<FormState>(() => ({
        name: plan?.name ?? "",
        price: plan ? centsToInputValue(plan.priceCents) : "",
        interval: (plan?.interval as PlanInterval) ?? "monthly",
        benefits: plan && plan.benefits.length > 0 ? plan.benefits : [""],
    }));

    const [errors, setErrors] = useState<FormErrors>({});

    useEffect(() => {
        setForm({
            name: plan?.name ?? "",
            price: plan ? centsToInputValue(plan.priceCents) : "",
            interval: (plan?.interval as PlanInterval) ?? "monthly",
            benefits: plan && plan.benefits.length > 0 ? plan.benefits : [""],
        });
        setErrors({});
    }, [plan]);

    const previewCents = parsePriceToCents(form.price);
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const updateField = useCallback(
        <K extends keyof FormState>(field: K, value: FormState[K]) => {
            setForm((prev) => ({ ...prev, [field]: value }));
            if (field in errors) {
                setErrors((prev) => ({ ...prev, [field]: undefined }));
            }
        },
        [errors],
    );

    const updateBenefit = (index: number, value: string) => {
        setForm((prev) => {
            const benefits = [...prev.benefits];
            benefits[index] = value;
            return { ...prev, benefits };
        });
    };

    const addBenefit = () => {
        setForm((prev) => ({ ...prev, benefits: [...prev.benefits, ""] }));
    };

    const removeBenefit = (index: number) => {
        setForm((prev) => ({
            ...prev,
            benefits: prev.benefits.filter((_, i) => i !== index),
        }));
    };

    const validate = (): boolean => {
        const newErrors: FormErrors = {};

        if (!form.name.trim()) {
            newErrors.name = "Informe o nome do plano";
        } else if (form.name.trim().length < 2) {
            newErrors.name = "Nome deve ter pelo menos 2 caracteres";
        } else if (form.name.trim().length > 80) {
            newErrors.name = "Nome deve ter no máximo 80 caracteres";
        }

        if (!form.price) {
            newErrors.price = "Informe o valor do plano";
        } else if (previewCents <= 0) {
            newErrors.price = "Valor deve ser maior que zero";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        const payload = {
            name: form.name.trim(),
            priceCents: previewCents,
            interval: form.interval,
            benefits: form.benefits.filter((b) => b.trim() !== ""),
        };

        try {
            if (isEditing && plan) {
                await updateMutation.mutateAsync({ planId: plan.id, payload });
                onSuccess(`Plano "${payload.name}" atualizado com sucesso`);
            } else {
                await createMutation.mutateAsync(payload);
                onSuccess(`Plano "${payload.name}" criado com sucesso`);
            }
            onClose();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setErrors({ name: "Já existe um plano com este nome" });
            } else {
                onError("Não foi possível salvar o plano. Tente novamente.");
            }
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-modal-title"
        >
            <div className="relative w-full max-w-lg mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <h2
                        id="plan-modal-title"
                        className="text-lg font-semibold text-neutral-900"
                    >
                        {isEditing ? "Editar plano" : "Novo plano"}
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
                    <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
                        <div className="space-y-1.5">
                            <Label htmlFor="plan-name">
                                Nome <span className="text-danger" aria-hidden="true">*</span>
                            </Label>
                            <Input
                                id="plan-name"
                                type="text"
                                value={form.name}
                                onChange={(e) => updateField("name", e.target.value)}
                                placeholder="Ex: Sócio Ouro"
                                maxLength={80}
                                aria-invalid={!!errors.name}
                                aria-describedby={errors.name ? "plan-name-error" : undefined}
                                disabled={isSubmitting}
                            />
                            {errors.name && (
                                <p id="plan-name-error" className="text-sm text-danger">
                                    {errors.name}
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="plan-price">
                                Valor <span className="text-danger" aria-hidden="true">*</span>
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none">
                                    R$
                                </span>
                                <Input
                                    id="plan-price"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={form.price}
                                    onChange={(e) => updateField("price", e.target.value)}
                                    placeholder="0,00"
                                    className={cn("pl-9 font-mono max-w-sm", errors.price && "border-danger")}
                                    aria-invalid={!!errors.price}
                                    aria-describedby="plan-price-preview plan-price-error"
                                    disabled={isSubmitting}
                                />
                            </div>
                            {form.price && previewCents > 0 && (
                                <p
                                    id="plan-price-preview"
                                    className="text-xs text-neutral-500 font-mono"
                                    aria-live="polite"
                                >
                                    {formatBRL(previewCents)}
                                </p>
                            )}
                            {errors.price && (
                                <p id="plan-price-error" className="text-sm text-danger">
                                    {errors.price}
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="plan-interval">Periodicidade</Label>
                            <select
                                id="plan-interval"
                                value={form.interval}
                                onChange={(e) =>
                                    updateField("interval", e.target.value as PlanInterval)
                                }
                                disabled={isSubmitting}
                                className="w-full max-w-sm h-9 rounded border border-neutral-300 bg-white px-3 py-1 text-[0.9375rem] text-neutral-900
                  transition-colors focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2
                  focus-visible:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500"
                            >
                                {INTERVAL_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label>Benefícios</Label>
                            <div className="space-y-2">
                                {form.benefits.map((benefit, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <Input
                                            type="text"
                                            value={benefit}
                                            onChange={(e) => updateBenefit(index, e.target.value)}
                                            placeholder="Ex: Entrada gratuita no estádio"
                                            maxLength={120}
                                            disabled={isSubmitting}
                                            aria-label={`Benefício ${index + 1}`}
                                        />
                                        {form.benefits.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeBenefit(index)}
                                                disabled={isSubmitting}
                                                className="flex-shrink-0 text-neutral-400 hover:text-danger transition-colors disabled:opacity-50"
                                                aria-label={`Remover benefício ${index + 1}`}
                                            >
                                                <Trash2 size={16} aria-hidden="true" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={addBenefit}
                                disabled={isSubmitting || form.benefits.length >= 20}
                                className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Plus size={14} aria-hidden="true" />
                                Adicionar benefício
                            </button>
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
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <Spinner />
                                    Salvando…
                                </span>
                            ) : isEditing ? (
                                "Salvar alterações"
                            ) : (
                                "Criar plano"
                            )}
                        </Button>
                    </div>
                </form>
            </div>
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