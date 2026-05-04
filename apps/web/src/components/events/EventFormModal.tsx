"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useCreateEvent, useUpdateEvent } from "@/hooks/use-events";
import { ApiError, type EventResponse } from "@/lib/api/events";
import { parsePriceToCents, toApiDatetime, toDatetimeLocalValue } from "@/lib/format";
import {
    EventSectorsTable,
    validateSectors,
    sectorsHaveErrors,
    type SectorRow,
    type SectorRowError,
} from "./EventSectorsTable";

interface EventFormModalProps {
    event?: EventResponse | null;
    onClose: () => void;
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
}

interface FormState {
    opponent: string;
    eventDate: string;
    venue: string;
    description: string;
}

interface FormErrors {
    opponent?: string;
    eventDate?: string;
    venue?: string;
}

function Field({
    htmlFor,
    label,
    required,
    error,
    children,
}: {
    htmlFor: string;
    label: string;
    required?: boolean;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={htmlFor}>
                {label}
                {required && <span className="text-danger ml-0.5" aria-hidden="true">*</span>}
            </Label>
            {children}
            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        </div>
    );
}

export function EventFormModal({ event, onClose, onSuccess, onError }: EventFormModalProps) {
    const isEditing = !!event;
    const createMutation = useCreateEvent();
    const updateMutation = useUpdateEvent();
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    const [form, setForm] = useState<FormState>({
        opponent: event?.opponent ?? "",
        eventDate: event ? toDatetimeLocalValue(event.eventDate) : "",
        venue: event?.venue ?? "",
        description: event?.description ?? "",
    });
    const [errors, setErrors] = useState<FormErrors>({});

    const [sectors, setSectors] = useState<SectorRow[]>([
        { name: "", capacity: "", priceCents: "" },
    ]);
    const [sectorErrors, setSectorErrors] = useState<SectorRowError[]>([{}]);

    const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
        setForm((prev) => ({ ...prev, [k]: v }));

    const validate = (): boolean => {
        const e: FormErrors = {};
        if (!form.opponent.trim()) e.opponent = "Informe o adversário";
        else if (form.opponent.trim().length > 120) e.opponent = "Máximo 120 caracteres";

        if (!form.eventDate) e.eventDate = "Informe a data e hora do evento";
        else if (isNaN(new Date(form.eventDate).getTime())) e.eventDate = "Data inválida";

        if (!form.venue.trim()) e.venue = "Informe o local do evento";
        else if (form.venue.trim().length > 200) e.venue = "Máximo 200 caracteres";

        setErrors(e);

        if (!isEditing) {
            const se = validateSectors(sectors);
            setSectorErrors(se);
            return Object.keys(e).length === 0 && !sectorsHaveErrors(se);
        }

        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        try {
            if (isEditing && event) {
                await updateMutation.mutateAsync({
                    eventId: event.id,
                    payload: {
                        opponent: form.opponent.trim(),
                        eventDate: toApiDatetime(form.eventDate),
                        venue: form.venue.trim(),
                        description: form.description.trim() || null,
                    },
                });
                onSuccess(`Evento "${form.opponent.trim()}" atualizado com sucesso`);
            } else {
                await createMutation.mutateAsync({
                    opponent: form.opponent.trim(),
                    eventDate: toApiDatetime(form.eventDate),
                    venue: form.venue.trim(),
                    description: form.description.trim() || undefined,
                    sectors: sectors.map((s) => ({
                        name: s.name.trim(),
                        capacity: parseInt(s.capacity, 10),
                        priceCents: parsePriceToCents(s.priceCents),
                    })),
                });
                onSuccess(`Evento "${form.opponent.trim()}" criado com sucesso`);
            }
            onClose();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                onError("Já existe um evento com esses dados. Verifique as informações e tente novamente.");
            } else {
                onError("Não foi possível salvar o evento. Tente novamente.");
            }
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-modal-title"
        >
            <div className="relative w-full max-w-2xl mx-4 bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                    <h2 id="event-modal-title" className="text-lg font-semibold text-neutral-900">
                        {isEditing ? "Editar evento" : "Novo evento"}
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
                        <Field htmlFor="ev-opponent" label="Adversário" required error={errors.opponent}>
                            <Input
                                id="ev-opponent"
                                value={form.opponent}
                                maxLength={120}
                                disabled={isSubmitting}
                                placeholder="Ex: Flamengo"
                                aria-invalid={!!errors.opponent}
                                onChange={(e) => set("opponent", e.target.value)}
                            />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field htmlFor="ev-date" label="Data e hora" required error={errors.eventDate}>
                                <Input
                                    id="ev-date"
                                    type="datetime-local"
                                    value={form.eventDate}
                                    disabled={isSubmitting}
                                    aria-invalid={!!errors.eventDate}
                                    onChange={(e) => set("eventDate", e.target.value)}
                                />
                            </Field>

                            <Field htmlFor="ev-venue" label="Local" required error={errors.venue}>
                                <Input
                                    id="ev-venue"
                                    value={form.venue}
                                    maxLength={200}
                                    disabled={isSubmitting}
                                    placeholder="Ex: Estádio Municipal"
                                    aria-invalid={!!errors.venue}
                                    onChange={(e) => set("venue", e.target.value)}
                                />
                            </Field>
                        </div>

                        <Field htmlFor="ev-description" label="Descrição">
                            <textarea
                                id="ev-description"
                                value={form.description}
                                maxLength={1000}
                                disabled={isSubmitting}
                                placeholder="Informações adicionais sobre o evento…"
                                rows={3}
                                onChange={(e) => set("description", e.target.value)}
                                className="flex w-full rounded border border-neutral-300 bg-white px-3 py-2 text-[0.9375rem] text-neutral-900 placeholder:text-neutral-400 transition-colors focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500 resize-none"
                            />
                        </Field>

                        <div className="space-y-1.5">
                            <Label>
                                Setores
                                {!isEditing && <span className="text-danger ml-0.5" aria-hidden="true">*</span>}
                            </Label>
                            {isEditing ? (
                                <>
                                    <EventSectorsTable mode="view" rows={event.sectors} />
                                    <p className="text-xs text-neutral-400">
                                        Os setores não podem ser alterados após a criação do evento.
                                    </p>
                                </>
                            ) : (
                                <EventSectorsTable
                                    mode="create"
                                    rows={sectors}
                                    errors={sectorErrors}
                                    disabled={isSubmitting}
                                    onChange={(rows) => {
                                        setSectors(rows);
                                        setSectorErrors(rows.map(() => ({})));
                                    }}
                                />
                            )}
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
                                "Criar evento"
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}