"use client";

import { useEffect, useState } from "react";
import { X, ShieldAlert, Lock, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { InjuryGradeBadge, GRADE_CONFIG } from "./InjuryGradeBadge";
import { useInjuryProtocols } from "@/hooks/use-injury-protocols";
import {
    useCreateMedicalRecord,
    useUpdateMedicalRecord,
    useDownloadMedicalRecordReport,
} from "@/hooks/use-medical-records";
import {
    MedicalRecordApiError,
    type MedicalRecordResponse,
    type InjuryGrade,
    type InjuryMechanism,
} from "@/lib/api/medical-records";

const GRADE_OPTIONS: InjuryGrade[] = [
    "GRADE_1",
    "GRADE_2",
    "GRADE_3",
    "COMPLETE",
];

const MECHANISM_OPTIONS: { value: InjuryMechanism; label: string }[] = [
    { value: "CONTACT", label: "Contato" },
    { value: "NON_CONTACT", label: "Sem contato" },
    { value: "OVERUSE", label: "Sobrecarga / overuse" },
    { value: "UNKNOWN", label: "Não identificado" },
];

/**
 * Common anatomical structures for the datalist.
 * Follows the FIFA Medical Assessment and Research Centre (F-MARC) classification.
 */
const STRUCTURE_SUGGESTIONS = [
    "Isquiotibiais",
    "Quadríceps",
    "Tornozelo (ligamento lateral)",
    "LCA",
    "LCP",
    "Ligamento Medial (LCM)",
    "Panturrilha (gastrocnêmio)",
    "Adutor",
    "Flexor do quadril",
    "Metatarso",
    "Tendão patelar",
    "Ombro (manguito rotador)",
    "Coluna lombar",
    "Menisco medial",
    "Menisco lateral",
    "Tibiotársica",
    "Plantar (fáscia)",
    "Tendão de Aquiles",
    "Músculo sóleo",
    "Reto abdominal",
];

interface FormState {
    occurredAt: string;
    structure: string;
    grade: InjuryGrade | "";
    mechanism: InjuryMechanism;
    protocolId: string;
    clinicalNotes: string;
    diagnosis: string;
    treatmentDetails: string;
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM: FormState = {
    occurredAt: todayIso(),
    structure: "",
    grade: "",
    mechanism: "UNKNOWN",
    protocolId: "",
    clinicalNotes: "",
    diagnosis: "",
    treatmentDetails: "",
};

function formFromRecord(record: MedicalRecordResponse): FormState {
    return {
        occurredAt: record.occurredAt,
        structure: record.structure,
        grade: record.grade,
        mechanism: record.mechanism,
        protocolId: record.protocolId ?? "",
        clinicalNotes: record.clinicalNotes ?? "",
        diagnosis: record.diagnosis ?? "",
        treatmentDetails: record.treatmentDetails ?? "",
    };
}

interface MedicalRecordFormModalProps {
    athleteId: string;
    athleteName: string;
    /** When provided, the modal opens in edit mode pre-populated from this record. */
    initialRecord?: MedicalRecordResponse;
    onClose: () => void;
    onSuccess?: (record: MedicalRecordResponse) => void;
}

/**
 * Modal form for creating or editing an injury medical record (prontuário).
 *
 * Modes:
 *   - **Create** (no `initialRecord`): sends POST /api/medical-records
 *   - **Edit** (`initialRecord` provided): sends PUT /api/medical-records/:id
 *
 * Access: PHYSIO and ADMIN only — callers must already gate with
 * `canAccessClinicalData(user?.role)` before mounting this component.
 *
 * Sections:
 *   1. Dados da Lesão — occurredAt, structure (with datalist), grade (radio cards), mechanism
 *   2. Protocolo de Retorno — optional protocol filtered by selected grade
 *   3. Dados Clínicos — clinicalNotes, diagnosis, treatmentDetails (AES-256 encrypted at rest)
 *
 * Footer (edit mode only):
 *   "Exportar Laudo" — triggers GET /api/medical-records/:id/report, downloads PDF
 *
 * Validation: requires occurredAt (10-char date), structure (≥2 chars), and grade.
 * Clinical fields are optional per the API contract.
 */
export function MedicalRecordFormModal({
    athleteId,
    athleteName,
    initialRecord,
    onClose,
    onSuccess,
}: MedicalRecordFormModalProps) {
    const isEditMode = !!initialRecord;

    const [form, setForm] = useState<FormState>(() =>
        initialRecord ? formFromRecord(initialRecord) : EMPTY_FORM,
    );
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    const { data: protocols = [] } = useInjuryProtocols({
        grade: form.grade || undefined,
        enabled: form.grade !== "",
    });

    const createMutation = useCreateMedicalRecord();
    const updateMutation = useUpdateMedicalRecord();
    const downloadMutation = useDownloadMedicalRecordReport();

    const isSaving = createMutation.isPending || updateMutation.isPending;

    const patch = (fields: Partial<FormState>) => {
        setFormError(null);
        setForm((prev) => ({ ...prev, ...fields }));
    };

    const isValid =
        form.occurredAt.length === 10 &&
        form.structure.trim().length >= 2 &&
        form.grade !== "";

    const handleSubmit = async () => {
        if (!isValid || isSaving) return;
        setFormError(null);

        try {
            let result: MedicalRecordResponse;

            if (isEditMode) {
                result = await updateMutation.mutateAsync({
                    recordId: initialRecord.id,
                    payload: {
                        occurredAt: form.occurredAt,
                        structure: form.structure.trim(),
                        grade: form.grade as InjuryGrade,
                        mechanism: form.mechanism,
                        protocolId: form.protocolId || null,
                        clinicalNotes: form.clinicalNotes.trim() || null,
                        diagnosis: form.diagnosis.trim() || null,
                        treatmentDetails: form.treatmentDetails.trim() || null,
                    },
                });
            } else {
                result = await createMutation.mutateAsync({
                    athleteId,
                    occurredAt: form.occurredAt,
                    structure: form.structure.trim(),
                    grade: form.grade as InjuryGrade,
                    mechanism: form.mechanism,
                    ...(form.protocolId ? { protocolId: form.protocolId } : {}),
                    ...(form.clinicalNotes.trim()
                        ? { clinicalNotes: form.clinicalNotes.trim() }
                        : {}),
                    ...(form.diagnosis.trim()
                        ? { diagnosis: form.diagnosis.trim() }
                        : {}),
                    ...(form.treatmentDetails.trim()
                        ? { treatmentDetails: form.treatmentDetails.trim() }
                        : {}),
                });
            }

            onSuccess?.(result);
            onClose();
        } catch (err) {
            console.error("[MedicalRecordFormModal] save error", err);

            const isKnownClientError =
                err instanceof MedicalRecordApiError && err.status < 500;

            setFormError(
                isKnownClientError
                    ? "Dados inválidos. Verifique os campos e tente novamente."
                    : "Erro ao salvar prontuário. Tente novamente.",
            );
        }
    };

    const handleExportPdf = () => {
        if (!initialRecord || downloadMutation.isPending) return;
        downloadMutation.mutate(initialRecord.id);
    };

    const textareaBase = cn(
        "w-full rounded border border-neutral-300 bg-white px-3 py-2",
        "text-sm text-neutral-900 resize-none transition-colors",
        "focus-visible:outline-none focus-visible:border-primary-500",
        "focus-visible:ring-2 focus-visible:ring-primary-500/20",
        "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
    );

    const selectBase = cn(
        "w-full h-9 rounded border border-neutral-300 bg-white px-3",
        "text-[0.9375rem] text-neutral-900 transition-colors",
        "focus-visible:outline-none focus-visible:border-primary-500",
        "focus-visible:ring-2 focus-visible:ring-primary-500/20",
        "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
    );

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="medical-form-title"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="relative w-full max-w-2xl mx-0 sm:mx-4 bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90dvh]">
                <div className="flex items-start justify-between px-5 py-4 border-b border-neutral-200 flex-shrink-0">
                    <div>
                        <h2
                            id="medical-form-title"
                            className="text-base font-semibold text-neutral-900"
                        >
                            {isEditMode ? "Editar Prontuário" : "Registrar Lesão"}
                        </h2>
                        <p className="text-xs text-neutral-500 mt-0.5">{athleteName}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="ml-4 flex-shrink-0 text-neutral-400 hover:text-neutral-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                        aria-label="Fechar formulário"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                <div className="flex items-center gap-2 px-5 py-2 bg-primary-50 border-b border-primary-100 text-primary-700 text-xs flex-shrink-0">
                    <Lock size={11} aria-hidden="true" />
                    Dados clínicos criptografados em repouso (AES-256) — acesso restrito
                    a PHYSIO e ADMIN.
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6">
                    <section aria-labelledby="section-injury-data">
                        <h3
                            id="section-injury-data"
                            className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-4"
                        >
                            Dados da Lesão
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="mr-occurred-at"
                                    className="text-xs font-medium text-neutral-600"
                                >
                                    Data da ocorrência{" "}
                                    <span className="text-danger" aria-hidden="true">
                                        *
                                    </span>
                                </Label>
                                <Input
                                    id="mr-occurred-at"
                                    type="date"
                                    value={form.occurredAt}
                                    max={todayIso()}
                                    onChange={(e) => patch({ occurredAt: e.target.value })}
                                    disabled={isSaving}
                                    className="h-9 text-sm"
                                    aria-required="true"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="mr-mechanism"
                                    className="text-xs font-medium text-neutral-600"
                                >
                                    Mecanismo
                                </Label>
                                <select
                                    id="mr-mechanism"
                                    value={form.mechanism}
                                    onChange={(e) =>
                                        patch({ mechanism: e.target.value as InjuryMechanism })
                                    }
                                    disabled={isSaving}
                                    className={selectBase}
                                >
                                    {MECHANISM_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1.5 mt-4">
                            <Label
                                htmlFor="mr-structure"
                                className="text-xs font-medium text-neutral-600"
                            >
                                Estrutura anatômica{" "}
                                <span className="text-danger" aria-hidden="true">
                                    *
                                </span>
                            </Label>
                            <Input
                                id="mr-structure"
                                type="text"
                                list="structure-suggestions"
                                placeholder="Ex: Isquiotibiais, LCA, Tornozelo…"
                                value={form.structure}
                                maxLength={200}
                                onChange={(e) => patch({ structure: e.target.value })}
                                disabled={isSaving}
                                className="h-9 text-sm"
                                aria-required="true"
                                aria-describedby="mr-structure-hint"
                            />
                            <datalist id="structure-suggestions">
                                {STRUCTURE_SUGGESTIONS.map((s) => (
                                    <option key={s} value={s} />
                                ))}
                            </datalist>
                            <p
                                id="mr-structure-hint"
                                className="text-[0.65rem] text-neutral-400"
                            >
                                Digite ou selecione uma estrutura da lista de sugestões.
                            </p>
                        </div>

                        <div className="space-y-2 mt-4">
                            <Label className="text-xs font-medium text-neutral-600">
                                Grau da lesão{" "}
                                <span className="text-danger" aria-hidden="true">
                                    *
                                </span>{" "}
                                <span className="font-normal text-neutral-400">
                                    (FIFA Medical 2023)
                                </span>
                            </Label>
                            <div
                                role="radiogroup"
                                aria-label="Grau da lesão"
                                aria-required="true"
                                className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                            >
                                {GRADE_OPTIONS.map((grade) => {
                                    const isSelected = form.grade === grade;
                                    const cfg = GRADE_CONFIG[grade];
                                    return (
                                        <button
                                            key={grade}
                                            type="button"
                                            role="radio"
                                            aria-checked={isSelected}
                                            onClick={() =>
                                                patch({
                                                    grade,
                                                    protocolId: "",
                                                })
                                            }
                                            disabled={isSaving}
                                            className={cn(
                                                "rounded-lg border-2 p-3 text-left transition-all duration-100",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
                                                "disabled:cursor-not-allowed disabled:opacity-60",
                                                isSelected
                                                    ? `${cfg.borderClass} ${cfg.bgClass}`
                                                    : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50",
                                            )}
                                        >
                                            <InjuryGradeBadge grade={grade} size="sm" />
                                            <p className="text-[0.65rem] text-neutral-400 mt-1.5 leading-tight">
                                                {cfg.description}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    <section aria-labelledby="section-protocol">
                        <h3
                            id="section-protocol"
                            className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-4"
                        >
                            Protocolo de Retorno ao Jogo{" "}
                            <span className="ml-1 font-normal normal-case text-neutral-300">
                                (opcional)
                            </span>
                        </h3>

                        <div className="space-y-1.5">
                            <Label
                                htmlFor="mr-protocol"
                                className="text-xs font-medium text-neutral-600"
                            >
                                Protocolo
                            </Label>
                            <select
                                id="mr-protocol"
                                value={form.protocolId}
                                onChange={(e) => patch({ protocolId: e.target.value })}
                                disabled={isSaving || form.grade === ""}
                                className={selectBase}
                                aria-describedby="mr-protocol-hint"
                            >
                                <option value="">
                                    {!form.grade
                                        ? "Selecione o grau primeiro"
                                        : protocols.length === 0
                                            ? "Nenhum protocolo para este grau"
                                            : "Selecionar protocolo…"}
                                </option>
                                {protocols.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} ({p.durationDays}d)
                                    </option>
                                ))}
                            </select>
                            {form.grade !== "" && protocols.length === 0 && (
                                <p
                                    id="mr-protocol-hint"
                                    className="text-xs text-neutral-400"
                                >
                                    Nenhum protocolo FIFA Medical disponível para este grau.
                                </p>
                            )}
                        </div>
                    </section>

                    <section aria-labelledby="section-clinical">
                        <h3
                            id="section-clinical"
                            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-4"
                        >
                            <ShieldAlert size={11} aria-hidden="true" />
                            Dados Clínicos
                            <span className="ml-1 font-normal normal-case text-neutral-300">
                                (opcional — criptografados)
                            </span>
                        </h3>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="mr-clinical-notes"
                                    className="text-xs font-medium text-neutral-600"
                                >
                                    Notas clínicas
                                </Label>
                                <textarea
                                    id="mr-clinical-notes"
                                    rows={4}
                                    maxLength={5000}
                                    value={form.clinicalNotes}
                                    onChange={(e) => patch({ clinicalNotes: e.target.value })}
                                    disabled={isSaving}
                                    placeholder="Observações clínicas, sintomas, exame físico…"
                                    className={textareaBase}
                                />
                                <p className="text-xs text-neutral-400 text-right tabular-nums">
                                    {form.clinicalNotes.length}/5000
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="mr-diagnosis"
                                    className="text-xs font-medium text-neutral-600"
                                >
                                    Diagnóstico
                                </Label>
                                <textarea
                                    id="mr-diagnosis"
                                    rows={3}
                                    maxLength={2000}
                                    value={form.diagnosis}
                                    onChange={(e) => patch({ diagnosis: e.target.value })}
                                    disabled={isSaving}
                                    placeholder="CID ou descrição diagnóstica…"
                                    className={textareaBase}
                                />
                                <p className="text-xs text-neutral-400 text-right tabular-nums">
                                    {form.diagnosis.length}/2000
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="mr-treatment"
                                    className="text-xs font-medium text-neutral-600"
                                >
                                    Detalhes do tratamento
                                </Label>
                                <textarea
                                    id="mr-treatment"
                                    rows={4}
                                    maxLength={5000}
                                    value={form.treatmentDetails}
                                    onChange={(e) => patch({ treatmentDetails: e.target.value })}
                                    disabled={isSaving}
                                    placeholder="Protocolo de fisioterapia, medicações, restrições…"
                                    className={textareaBase}
                                />
                                <p className="text-xs text-neutral-400 text-right tabular-nums">
                                    {form.treatmentDetails.length}/5000
                                </p>
                            </div>
                        </div>
                    </section>

                    {formError && (
                        <p className="text-sm text-danger" role="alert">
                            {formError}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-neutral-200 bg-neutral-50 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        {isEditMode && (
                            <Button
                                variant="secondary"
                                onClick={handleExportPdf}
                                disabled={downloadMutation.isPending || isSaving}
                                aria-label="Exportar laudo em PDF para seguro ou plano de saúde"
                            >
                                {downloadMutation.isPending ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2
                                            size={14}
                                            className="animate-spin"
                                            aria-hidden="true"
                                        />
                                        Gerando PDF…
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <FileText size={14} aria-hidden="true" />
                                        Exportar Laudo
                                    </span>
                                )}
                            </Button>
                        )}
                        {!isValid && !isEditMode && (
                            <p className="text-xs text-neutral-400" role="note">
                                Preencha data, estrutura e grau da lesão para salvar.
                            </p>
                        )}
                    </div>

                    <div className="flex gap-2 ml-auto">
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            disabled={isSaving}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={!isValid || isSaving}
                            aria-disabled={!isValid}
                        >
                            {isSaving ? (
                                <span className="flex items-center gap-2">
                                    <Loader2
                                        size={14}
                                        className="animate-spin"
                                        aria-hidden="true"
                                    />
                                    Salvando…
                                </span>
                            ) : isEditMode ? (
                                "Atualizar prontuário"
                            ) : (
                                "Registrar lesão"
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}