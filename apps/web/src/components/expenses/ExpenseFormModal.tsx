"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateExpense, useUpdateExpense } from "@/hooks/use-expenses";
import {
    EXPENSE_CATEGORIES,
    CATEGORY_LABELS,
    type ExpenseResponse,
    type ExpenseCategory,
} from "@/lib/api/expenses";
import { parsePriceToCents, centsToInputValue } from "@/lib/format";
import { ApiError } from "@/lib/api/expenses";

interface ExpenseFormModalProps {
    expense?: ExpenseResponse | null;
    onClose: () => void;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}

interface FormState {
    description: string;
    amountStr: string;
    category: ExpenseCategory;
    date: string;
    notes: string;
}

interface FormErrors {
    description?: string;
    amountStr?: string;
    category?: string;
    date?: string;
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function Spinner() {
    return (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    );
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
                    <span className="text-danger ml-0.5" aria-hidden="true">*</span>
                )}
            </Label>
            {hint && <p className="text-xs text-neutral-400">{hint}</p>}
            {children}
            {error && (
                <p className="text-sm text-danger" role="alert">{error}</p>
            )}
        </div>
    );
}

export function ExpenseFormModal({
    expense,
    onClose,
    onSuccess,
    onError,
}: ExpenseFormModalProps) {
    const isEditing = !!expense;
    const createMutation = useCreateExpense();
    const updateMutation = useUpdateExpense();

    const [form, setForm] = useState<FormState>({
        description: expense?.description ?? "",
        amountStr: expense ? centsToInputValue(expense.amountCents) : "",
        category: expense?.category ?? "OTHER",
        date: expense?.date ?? todayIso(),
        notes: expense?.notes ?? "",
    });

    const [errors, setErrors] = useState<FormErrors>({});

    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !isSubmitting) onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isSubmitting, onClose]);

    const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
        setForm((prev) => ({ ...prev, [k]: v }));

    const validate = (): boolean => {
        const e: FormErrors = {};

        if (!form.description.trim()) {
            e.description = "Informe a descrição da despesa";
        } else if (form.description.trim().length < 2) {
            e.description = "Descrição deve ter pelo menos 2 caracteres";
        } else if (form.description.trim().length > 200) {
            e.description = "Descrição deve ter no máximo 200 caracteres";
        }

        const cents = parsePriceToCents(form.amountStr);
        if (!form.amountStr.trim() || isNaN(parseFloat(form.amountStr))) {
            e.amountStr = "Informe o valor da despesa";
        } else if (cents <= 0) {
            e.amountStr = "O valor deve ser maior que zero";
        }

        if (!form.date) {
            e.date = "Informe a data da despesa";
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
            e.date = "Data inválida";
        }

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        const amountCents = parsePriceToCents(form.amountStr);

        try {
            if (isEditing && expense) {
                await updateMutation.mutateAsync({
                    expenseId: expense.id,
                    payload: {
                        description: form.description.trim(),
                        amountCents,
                        category: form.category,
                        date: form.date,
                        notes: form.notes.trim() || null,
                    },
                });
                onSuccess(`Despesa "${form.description.trim()}" atualizada com sucesso`);
            } else {
                await createMutation.mutateAsync({
                    description: form.description.trim(),
                    amountCents,
                    category: form.category,
                    date: form.date,
                    notes: form.notes.trim() || undefined,
                });
                onSuccess(`Despesa "${form.description.trim()}" registrada com sucesso`);
            }
            onClose();
        } catch (err) {
            onError(
                err instanceof ApiError
                    ? err.message
                    : "Não foi possível salvar a despesa. Tente novamente.",
            );
        }
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-modal-title"
            onClick={handleBackdropClick}
        >
            <div className="relative w-full max-w-lg mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <h2 id="expense-modal-title" className="text-lg font-semibold text-neutral-900">
                        {isEditing ? "Editar despesa" : "Nova despesa"}
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

                        <Field label="Descrição" required error={errors.description} htmlFor="exp-desc">
                            <Input
                                id="exp-desc"
                                type="text"
                                value={form.description}
                                maxLength={200}
                                disabled={isSubmitting}
                                placeholder="Ex: Pagamento de árbitros"
                                aria-invalid={!!errors.description}
                                onChange={(e) => set("description", e.target.value)}
                            />
                        </Field>

                        <Field
                            label="Valor (R$)"
                            required
                            error={errors.amountStr}
                            htmlFor="exp-amount"
                            hint="Ex: 1490.00"
                        >
                            <Input
                                id="exp-amount"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={form.amountStr}
                                disabled={isSubmitting}
                                placeholder="0.00"
                                aria-invalid={!!errors.amountStr}
                                className="font-mono max-w-[200px]"
                                onChange={(e) => set("amountStr", e.target.value)}
                            />
                        </Field>

                        <div className="space-y-1.5">
                            <Label htmlFor="exp-category">
                                Categoria
                                <span className="text-danger ml-0.5" aria-hidden="true">*</span>
                            </Label>
                            <select
                                id="exp-category"
                                value={form.category}
                                disabled={isSubmitting}
                                onChange={(e) => set("category", e.target.value as ExpenseCategory)}
                                className="w-full h-9 rounded border border-neutral-300 bg-white px-3 py-1
                  text-[0.9375rem] text-neutral-900 transition-colors
                  focus-visible:outline-none focus-visible:border-primary-500
                  focus-visible:ring-2 focus-visible:ring-primary-500/20
                  disabled:cursor-not-allowed disabled:bg-neutral-50"
                                aria-label="Selecionar categoria"
                            >
                                {EXPENSE_CATEGORIES.map((c) => (
                                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                                ))}
                            </select>
                        </div>

                        <Field label="Data" required error={errors.date} htmlFor="exp-date">
                            <Input
                                id="exp-date"
                                type="date"
                                value={form.date}
                                disabled={isSubmitting}
                                aria-invalid={!!errors.date}
                                className="max-w-[200px]"
                                onChange={(e) => set("date", e.target.value)}
                            />
                        </Field>

                        <div className="space-y-1.5">
                            <Label htmlFor="exp-notes">Observações</Label>
                            <textarea
                                id="exp-notes"
                                value={form.notes}
                                disabled={isSubmitting}
                                maxLength={500}
                                rows={3}
                                placeholder="Detalhes adicionais (opcional)"
                                className="flex w-full rounded border border-neutral-300 bg-white px-3 py-2
                  text-[0.9375rem] text-neutral-900 placeholder:text-neutral-400 resize-none
                  transition-colors focus-visible:outline-none focus-visible:border-primary-500
                  focus-visible:ring-2 focus-visible:ring-primary-500/20
                  disabled:cursor-not-allowed disabled:bg-neutral-50"
                                onChange={(e) => set("notes", e.target.value)}
                            />
                            <p className="text-xs text-neutral-400 text-right">
                                {form.notes.length}/500
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 bg-neutral-50">
                        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
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
                                "Registrar despesa"
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}