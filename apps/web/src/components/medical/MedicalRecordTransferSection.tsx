"use client";

import { useState } from "react";
import { SendHorizonal, Loader2, ChevronDown, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { usePhysioClubs, useTransferMedicalRecord } from "@/hooks/use-physio-clubs";
import { PhysioApiError } from "@/lib/api/physio";

interface MedicalRecordTransferSectionProps {
    recordId: string;
    currentClubId: string;
    disabled?: boolean;
    onSuccess?: (newRecordId: string) => void;
}

/**
 * Collapsible transfer section for the MedicalRecordFormModal (edit mode only).
 *
 * Visible only when the authenticated PHYSIO has access to more than one club.
 * Requires:
 *   - Target club selection (must differ from current club).
 *   - Consent notes (min 10 chars) — stored in audit_log metadata for LGPD.
 *
 * The target athlete must already exist in the destination club (matched by CPF).
 * If not found, the API returns a descriptive error that is surfaced inline.
 */
export function MedicalRecordTransferSection({
    recordId,
    currentClubId,
    disabled = false,
    onSuccess,
}: MedicalRecordTransferSectionProps) {
    const [expanded, setExpanded] = useState(false);
    const [targetClubId, setTargetClubId] = useState("");
    const [consentNotes, setConsentNotes] = useState("");
    const [transferError, setTransferError] = useState<string | null>(null);
    const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

    const { data: clubs } = usePhysioClubs();
    const transferMutation = useTransferMedicalRecord();

    const otherClubs = (clubs ?? []).filter((c) => c.clubId !== currentClubId);
    if (otherClubs.length === 0) return null;

    const isValid =
        targetClubId !== "" &&
        targetClubId !== currentClubId &&
        consentNotes.trim().length >= 10;

    const handleTransfer = async () => {
        if (!isValid || transferMutation.isPending) return;
        setTransferError(null);
        setTransferSuccess(null);

        try {
            const result = await transferMutation.mutateAsync({
                recordId,
                targetClubId,
                consentNotes: consentNotes.trim(),
            });
            setTransferSuccess(
                `Prontuário transferido com sucesso. Novo ID no clube-destino: ${result.newRecordId}`,
            );
            setTargetClubId("");
            setConsentNotes("");
        } catch (err) {
            const isKnown = err instanceof PhysioApiError && err.status < 500;
            setTransferError(
                isKnown
                    ? (err as PhysioApiError).message
                    : "Erro ao transferir prontuário. Tente novamente.",
            );
        }
    };

    const selectBase = cn(
        "w-full h-9 rounded border border-neutral-300 bg-white px-3",
        "text-[0.9375rem] text-neutral-900 transition-colors",
        "focus-visible:outline-none focus-visible:border-primary-500",
        "focus-visible:ring-2 focus-visible:ring-primary-500/20",
        "disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500",
    );

    return (
        <section
            className="border border-neutral-200 rounded-lg overflow-hidden"
            aria-labelledby="transfer-section-heading"
        >
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                disabled={disabled}
                className={cn(
                    "w-full flex items-center justify-between px-4 py-3",
                    "text-left text-sm font-medium text-neutral-700 bg-neutral-50",
                    "hover:bg-neutral-100 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                )}
                aria-expanded={expanded}
                aria-controls="transfer-section-body"
            >
                <span
                    id="transfer-section-heading"
                    className="flex items-center gap-2"
                >
                    <SendHorizonal size={14} className="text-neutral-500" aria-hidden />
                    Transferir Prontuário para Outro Clube
                </span>
                {expanded ? (
                    <ChevronDown size={14} className="text-neutral-400" aria-hidden />
                ) : (
                    <ChevronRight size={14} className="text-neutral-400" aria-hidden />
                )}
            </button>

            {expanded && (
                <div
                    id="transfer-section-body"
                    className="px-4 py-4 space-y-4 border-t border-neutral-200 bg-white"
                >
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-md text-xs text-amber-800 leading-relaxed">
                        <Info size={13} className="flex-shrink-0 mt-0.5" aria-hidden />
                        <span>
                            O atleta deve estar cadastrado no clube-destino. O prontuário será
                            copiado com novo ID — o original permanece no clube atual.
                            O consentimento ficará registrado no log de auditoria de ambos os
                            clubes (LGPD Art. 37).
                        </span>
                    </div>

                    <div className="space-y-1.5">
                        <Label
                            htmlFor="transfer-target-club"
                            className="text-xs font-medium text-neutral-600"
                        >
                            Clube de destino{" "}
                            <span className="text-danger" aria-hidden>*</span>
                        </Label>
                        <select
                            id="transfer-target-club"
                            value={targetClubId}
                            onChange={(e) => {
                                setTargetClubId(e.target.value);
                                setTransferError(null);
                            }}
                            disabled={transferMutation.isPending || disabled}
                            className={selectBase}
                        >
                            <option value="">Selecionar clube…</option>
                            {otherClubs.map((club) => (
                                <option key={club.clubId} value={club.clubId}>
                                    {club.clubName}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <Label
                            htmlFor="transfer-consent-notes"
                            className="text-xs font-medium text-neutral-600"
                        >
                            Justificativa / consentimento{" "}
                            <span className="text-danger" aria-hidden>*</span>
                        </Label>
                        <textarea
                            id="transfer-consent-notes"
                            rows={3}
                            maxLength={500}
                            value={consentNotes}
                            onChange={(e) => {
                                setConsentNotes(e.target.value);
                                setTransferError(null);
                            }}
                            disabled={transferMutation.isPending || disabled}
                            placeholder="Descreva o motivo da transferência e o consentimento do atleta (mín. 10 caracteres)…"
                            className={cn(
                                "w-full rounded border border-neutral-300 bg-white px-3 py-2",
                                "text-sm text-neutral-900 resize-none transition-colors",
                                "focus-visible:outline-none focus-visible:border-primary-500",
                                "focus-visible:ring-2 focus-visible:ring-primary-500/20",
                                "disabled:cursor-not-allowed disabled:bg-neutral-50",
                            )}
                            aria-required="true"
                            aria-describedby="transfer-consent-hint"
                        />
                        <div
                            id="transfer-consent-hint"
                            className="flex items-center justify-between"
                        >
                            <span className="text-[0.65rem] text-neutral-400">
                                Mínimo 10 caracteres. Armazenado no audit_log de ambos os clubes.
                            </span>
                            <span className="text-[0.65rem] text-neutral-400 tabular-nums">
                                {consentNotes.length}/500
                            </span>
                        </div>
                    </div>

                    {transferError && (
                        <p className="text-sm text-danger" role="alert">
                            {transferError}
                        </p>
                    )}

                    {transferSuccess && (
                        <p className="text-sm text-success" role="status">
                            {transferSuccess}
                        </p>
                    )}

                    <Button
                        variant="secondary"
                        onClick={handleTransfer}
                        disabled={!isValid || transferMutation.isPending || disabled}
                        aria-disabled={!isValid}
                        className="w-full"
                    >
                        {transferMutation.isPending ? (
                            <span className="flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" aria-hidden />
                                Transferindo…
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <SendHorizonal size={14} aria-hidden />
                                Transferir prontuário
                            </span>
                        )}
                    </Button>
                </div>
            )}
        </section>
    );
}