"use client";

import { useState, useEffect } from "react";
import { ClipboardCheck, Download, Plus, Loader2, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchAthletes } from "@/lib/api/athletes";
import {
    useEvaluations,
    useCreateEvaluation,
    useUpdateEvaluation,
} from "@/hooks/use-evaluations";
import { useExportEvaluationPdf } from "./EvaluationPdfReport";
import { EvaluationScoreInput } from "./EvaluationScoreInput";
import { Button } from "@/components/ui/button";
import { EvaluationApiError } from "@/lib/api/evaluations";
import { cn } from "@/lib/utils";

/**
 * Returns the current ISO week string in YYYY-Www format.
 * Uses the ISO 8601 definition where week 1 is the week containing the
 * year's first Thursday.
 */
function getCurrentIsoWeek(): string {
    const now = new Date();
    const thursday = new Date(now);
    thursday.setUTCDate(now.getUTCDate() + 4 - (now.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
        ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

const EMPTY_SCORES = {
    technique: 0,
    tactical: 0,
    physical: 0,
    mental: 0,
    attitude: 0,
};

type Scores = typeof EMPTY_SCORES;

/**
 * Composite form that lets a coach:
 *   1. Pick an athlete and a training microcycle (ISO week).
 *   2. Score each of the 5 criteria on a 1–5 scale.
 *   3. Add optional notes.
 *   4. Save (creates) or update (if an evaluation already exists).
 *   5. Export the saved evaluation as a PDF.
 *
 * Role behaviour:
 *   - ADMIN: full read-write access — can create, update, add notes.
 *   - TREASURER: read-only — scores are rendered but all inputs are disabled;
 *     Save/Update and PDF buttons are hidden.
 *
 * The query for existing evaluations is keyed on (athleteId, microcycle) and
 * is only fired when both are non-empty.
 */
export function TechnicalEvaluationBoard() {
    const { getAccessToken, user } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const { exportPdf } = useExportEvaluationPdf();

    const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");
    const [microcycle, setMicrocycle] = useState<string>(getCurrentIsoWeek());
    const [scores, setScores] = useState<Scores>(EMPTY_SCORES);
    const [notes, setNotes] = useState<string>("");

    const [isExporting, setIsExporting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const { data: athletesData, isLoading: isLoadingAthletes } = useQuery({
        queryKey: ["athletes-picker-evaluations"],
        queryFn: async () => {
            const token = await getAccessToken();
            if (!token) throw new Error("Not authenticated");
            return fetchAthletes({ limit: 100, status: "ACTIVE" }, token);
        },
        staleTime: 5 * 60 * 1000,
    });

    const { data: existingEvals } = useEvaluations({
        athleteId: selectedAthleteId || undefined,
        microcycle: microcycle || undefined,
    });

    const existingEvaluation = existingEvals?.data[0] ?? null;

    useEffect(() => {
        if (existingEvaluation) {
            setScores({
                technique: existingEvaluation.technique,
                tactical: existingEvaluation.tactical,
                physical: existingEvaluation.physical,
                mental: existingEvaluation.mental,
                attitude: existingEvaluation.attitude,
            });
            setNotes(existingEvaluation.notes ?? "");
        } else {
            setScores(EMPTY_SCORES);
            setNotes("");
        }
        setFormError(null);
        setSaveSuccess(false);
    }, [existingEvaluation?.id, selectedAthleteId, microcycle]);

    const createMutation = useCreateEvaluation();
    const updateMutation = useUpdateEvaluation();
    const isSaving = createMutation.isPending || updateMutation.isPending;

    const isScoresComplete = Object.values(scores).every((v) => v > 0);

    const handleSave = async () => {
        if (!selectedAthleteId || !isScoresComplete) return;
        setFormError(null);
        setSaveSuccess(false);

        try {
            const date = new Date().toISOString().slice(0, 10);

            if (existingEvaluation) {
                await updateMutation.mutateAsync({
                    id: existingEvaluation.id,
                    payload: { ...scores, notes: notes || null },
                });
            } else {
                await createMutation.mutateAsync({
                    athleteId: selectedAthleteId,
                    microcycle,
                    date,
                    ...scores,
                    notes: notes || undefined,
                });
            }
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            const msg =
                err instanceof EvaluationApiError
                    ? err.message
                    : "Erro ao salvar avaliação. Tente novamente.";
            setFormError(msg);
        }
    };

    const handleExportPdf = async () => {
        if (!existingEvaluation) return;
        setIsExporting(true);
        try {
            const clubDisplayName = user?.clubId ?? "ClubOS";
            await exportPdf(existingEvaluation, clubDisplayName);
        } catch {
            setFormError("Não foi possível gerar o PDF. Tente novamente.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleScoreChange = (criterion: keyof Scores) => (value: number) => {
        setSaveSuccess(false);
        setScores((prev) => ({ ...prev, [criterion]: value }));
    };

    return (
        <section
            aria-labelledby="evaluation-board-heading"
            className="bg-white rounded-lg border border-neutral-200 overflow-hidden"
        >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                <div className="flex items-center gap-2 min-w-0">
                    <ClipboardCheck
                        size={16}
                        className="text-primary-600 flex-shrink-0"
                        aria-hidden="true"
                    />
                    <h2
                        id="evaluation-board-heading"
                        className="text-sm font-semibold text-neutral-900"
                    >
                        Avaliação Técnica
                    </h2>

                    {existingEvaluation && (
                        <span className="flex-shrink-0 ml-1 text-xs text-primary-700 bg-primary-50 border border-primary-200 rounded-full px-2 py-0.5 font-medium">
                            Salvo
                        </span>
                    )}
                </div>

                {existingEvaluation && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleExportPdf}
                        disabled={isExporting}
                        aria-label="Exportar avaliação como PDF"
                        className="flex-shrink-0 ml-2"
                    >
                        {isExporting ? (
                            <Loader2
                                size={14}
                                className="animate-spin"
                                aria-hidden="true"
                            />
                        ) : (
                            <Download size={14} aria-hidden="true" />
                        )}
                        Exportar PDF
                    </Button>
                )}
            </div>

            <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label
                            htmlFor="eval-athlete"
                            className="text-xs font-medium text-neutral-500"
                        >
                            Atleta *
                        </label>
                        <select
                            id="eval-athlete"
                            value={selectedAthleteId}
                            onChange={(e) => setSelectedAthleteId(e.target.value)}
                            disabled={isLoadingAthletes || isSaving}
                            className={cn(
                                "w-full h-9 rounded border border-neutral-300 bg-white px-3",
                                "text-[0.9375rem] text-neutral-900 transition-colors",
                                "focus-visible:outline-none focus-visible:border-primary-500",
                                "focus-visible:ring-2 focus-visible:ring-primary-500/20",
                                "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
                            )}
                            aria-label="Selecionar atleta para avaliação técnica"
                        >
                            <option value="">
                                {isLoadingAthletes
                                    ? "Carregando atletas…"
                                    : "Selecione um atleta…"}
                            </option>
                            {athletesData?.data.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name}
                                    {a.position ? ` — ${a.position}` : ""}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor="eval-microcycle"
                            className="text-xs font-medium text-neutral-500"
                        >
                            Microciclo *
                        </label>
                        <input
                            id="eval-microcycle"
                            type="text"
                            pattern="\d{4}-W\d{2}"
                            value={microcycle}
                            onChange={(e) => setMicrocycle(e.target.value)}
                            disabled={isSaving}
                            placeholder="2025-W03"
                            className={cn(
                                "w-full h-9 rounded border border-neutral-300 bg-white px-3",
                                "text-[0.9375rem] font-mono text-neutral-900 transition-colors",
                                "focus-visible:outline-none focus-visible:border-primary-500",
                                "focus-visible:ring-2 focus-visible:ring-primary-500/20",
                                "disabled:cursor-not-allowed disabled:bg-neutral-50",
                            )}
                            aria-label="Identificador do microciclo (formato YYYY-Www, ex: 2025-W03)"
                        />
                        <p className="text-[0.65rem] text-neutral-400 leading-none">
                            Formato: YYYY-Www · Semana atual: {getCurrentIsoWeek()}
                        </p>
                    </div>
                </div>

                {!selectedAthleteId ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <ClipboardCheck
                            size={40}
                            className="text-neutral-200 mb-3"
                            aria-hidden="true"
                        />
                        <p className="text-sm text-neutral-500 font-medium">
                            Selecione um atleta para iniciar a avaliação
                        </p>
                        <p className="text-xs text-neutral-400 mt-1.5 max-w-xs leading-relaxed">
                            Preencha os 5 critérios para registrar o desempenho técnico do
                            atleta no microciclo selecionado.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-3.5">
                            <EvaluationScoreInput
                                id="score-technique"
                                label="Técnica"
                                value={scores.technique}
                                onChange={handleScoreChange("technique")}
                                disabled={!isAdmin || isSaving}
                            />
                            <EvaluationScoreInput
                                id="score-tactical"
                                label="Tática"
                                value={scores.tactical}
                                onChange={handleScoreChange("tactical")}
                                disabled={!isAdmin || isSaving}
                            />
                            <EvaluationScoreInput
                                id="score-physical"
                                label="Físico"
                                value={scores.physical}
                                onChange={handleScoreChange("physical")}
                                disabled={!isAdmin || isSaving}
                            />
                            <EvaluationScoreInput
                                id="score-mental"
                                label="Mental"
                                value={scores.mental}
                                onChange={handleScoreChange("mental")}
                                disabled={!isAdmin || isSaving}
                            />
                            <EvaluationScoreInput
                                id="score-attitude"
                                label="Atitude"
                                value={scores.attitude}
                                onChange={handleScoreChange("attitude")}
                                disabled={!isAdmin || isSaving}
                            />
                        </div>

                        {isScoresComplete && (
                            <div className="flex items-center justify-between px-3 py-2.5 bg-primary-50 border border-primary-100 rounded">
                                <span className="text-xs font-medium text-primary-700">
                                    Média atual
                                </span>
                                <span className="font-mono font-bold text-lg text-primary-700">
                                    {(
                                        (scores.technique + scores.tactical + scores.physical +
                                            scores.mental + scores.attitude) / 5
                                    ).toFixed(1)}
                                </span>
                            </div>
                        )}

                        {isAdmin && (
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="eval-notes"
                                    className="text-xs font-medium text-neutral-500"
                                >
                                    Observações{" "}
                                    <span className="text-neutral-400 font-normal">(opcional)</span>
                                </label>
                                <textarea
                                    id="eval-notes"
                                    rows={3}
                                    maxLength={1000}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    disabled={isSaving}
                                    placeholder="Pontos de melhoria, destaques, metas para o próximo microciclo…"
                                    className={cn(
                                        "w-full rounded border border-neutral-300 bg-white px-3 py-2",
                                        "text-sm text-neutral-900 resize-none transition-colors",
                                        "focus-visible:outline-none focus-visible:border-primary-500",
                                        "focus-visible:ring-2 focus-visible:ring-primary-500/20",
                                        "disabled:cursor-not-allowed disabled:bg-neutral-50",
                                    )}
                                />
                                <p className="text-xs text-neutral-400 text-right tabular-nums">
                                    {notes.length}/1000
                                </p>
                            </div>
                        )}

                        {formError && (
                            <p className="text-sm text-danger" role="alert">
                                {formError}
                            </p>
                        )}

                        {isAdmin && (
                            <div className="flex items-center justify-between gap-3">
                                {saveSuccess ? (
                                    <span
                                        className="flex items-center gap-1.5 text-sm text-primary-600"
                                        role="status"
                                        aria-live="polite"
                                    >
                                        <CheckCircle size={15} aria-hidden="true" />
                                        Avaliação salva com sucesso
                                    </span>
                                ) : (
                                    <span />
                                )}

                                <Button
                                    onClick={handleSave}
                                    disabled={!isScoresComplete || isSaving}
                                    aria-disabled={!isScoresComplete}
                                    className="ml-auto"
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
                                    ) : (
                                        <>
                                            <Plus size={14} aria-hidden="true" />
                                            {existingEvaluation
                                                ? "Atualizar avaliação"
                                                : "Salvar avaliação"}
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}

                        {!isScoresComplete && isAdmin && (
                            <p
                                className="text-xs text-neutral-400 text-center"
                                role="note"
                            >
                                Preencha todos os 5 critérios para salvar a avaliação.
                            </p>
                        )}

                        {!isAdmin && (
                            <p className="text-xs text-neutral-400 text-center" role="note">
                                Apenas administradores podem criar ou editar avaliações.
                            </p>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}