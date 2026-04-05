"use client";

import { useState, useEffect, useRef } from "react";
import {
  ShieldCheck,
  Loader2,
  AlertTriangle,
  X,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  recordParentalConsent,
  CURRENT_CONSENT_VERSION,
  ConsentApiError,
} from "@/lib/api/tryout-consent";
import { CONSENT_V1_TEXT } from "@/lib/consent/consent-text";

interface ParentalConsentModalProps {
  clubSlug: string;
  athleteName: string;
  /** Must match the guardianName field in the parent form */
  guardianName: string;
  /** Digits only — no formatting mask */
  guardianPhone: string;
  guardianRelationship: "mae" | "pai" | "avo" | "tio" | "outro";
  /**
   * Called with the HMAC consent token when the guardian completes all three
   * gates and the API records the consent. The parent form uses this token
   * to unlock the submit button and include it in the final submission.
   */
  onConsentRecorded: (consentToken: string) => void;
  onClose: () => void;
}

/**
 * Hard-stop modal for LGPD Art. 14 parental consent of minor athletes.
 *
 * Three sequential gates must all be satisfied before the guardian can confirm:
 *   Gate 1 — Scroll  : Guardian must scroll the consent document to the bottom.
 *   Gate 2 — Name    : Guardian must type their name exactly as provided in the form.
 *   Gate 3 — Checkbox: Guardian must check the explicit consent checkbox.
 *
 * On confirm:
 *   - Calls POST /api/public/tryout-consent via recordParentalConsent()
 *   - On success: invokes onConsentRecorded(token) and the modal self-closes
 *     (parent calls setShowConsentModal(false) inside the callback)
 *   - On error: displays the API error message inline
 *
 * Accessibility:
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - Escape key closes the modal
 *   - Focus trap: body overflow hidden while open
 *   - Scroll container is focusable (tabIndex=0) for keyboard-only users
 */
export function ParentalConsentModal({
  clubSlug,
  athleteName,
  guardianName,
  guardianPhone,
  guardianRelationship,
  onConsentRecorded,
  onClose,
}: ParentalConsentModalProps) {
  const [hasScrolled, setHasScrolled] = useState(false);
  const [nameConfirmation, setNameConfirmation] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 40;
    if (atBottom && !hasScrolled) setHasScrolled(true);
  };

  const nameMatches =
    nameConfirmation.trim().toLowerCase() === guardianName.trim().toLowerCase();

  const canSubmit = hasScrolled && nameMatches && agreed && !isSubmitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await recordParentalConsent({
        clubSlug,
        athleteName,
        guardianName: guardianName.trim(),
        guardianPhone,
        guardianRelationship,
        consentVersion: CURRENT_CONSENT_VERSION,
      });
      onConsentRecorded(result.consentToken);
    } catch (err) {
      const message =
        err instanceof ConsentApiError
          ? err.message
          : "Erro ao registrar o aceite. Tente novamente.";
      setError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-modal-title"
    >
      <div className="relative w-full max-w-lg mx-0 sm:mx-4 bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95dvh]">
        <div className="flex items-start justify-between px-5 py-4 border-b border-neutral-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0"
              aria-hidden="true"
            >
              <ShieldCheck size={20} className="text-amber-600" />
            </div>
            <div>
              <h2
                id="consent-modal-title"
                className="text-base font-bold text-neutral-900"
              >
                Consentimento Parental Obrigatório
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Termo de Consentimento — versão {CURRENT_CONSENT_VERSION} · LGPD
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 ml-3 text-neutral-400 hover:text-neutral-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            aria-label="Fechar"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-start gap-2 flex-shrink-0">
          <AlertTriangle
            size={14}
            className="text-amber-600 flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="text-xs text-amber-700 leading-relaxed">
            O atleta <strong className="font-semibold">{athleteName}</strong> é
            menor de 18 anos. O consentimento do responsável legal é obrigatório
            por lei (LGPD, Art. 14) antes do tratamento dos seus dados.
          </p>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 py-4 text-xs text-neutral-700 leading-relaxed font-mono whitespace-pre-wrap bg-neutral-50 border-b border-neutral-200 min-h-0"
          tabIndex={0}
          aria-label="Texto do termo de consentimento — role para ler"
          role="region"
        >
          {CONSENT_V1_TEXT}
        </div>

        {!hasScrolled && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5 text-xs text-amber-600 font-medium flex-shrink-0">
            <ScrollText size={12} aria-hidden="true" />
            Role o texto até ao final para continuar
          </div>
        )}

        <div className="px-5 py-4 space-y-4 flex-shrink-0">
          <div className="space-y-1.5">
            <Label
              htmlFor="guardian-name-confirm"
              className="text-sm font-semibold text-neutral-700"
            >
              Confirme o seu nome para assinar
            </Label>
            <Input
              id="guardian-name-confirm"
              type="text"
              autoComplete="name"
              placeholder={`Digite: ${guardianName}`}
              value={nameConfirmation}
              onChange={(e) => setNameConfirmation(e.target.value)}
              disabled={!hasScrolled || isSubmitting}
              aria-invalid={nameConfirmation.length > 0 && !nameMatches}
              aria-describedby={
                nameConfirmation.length > 0 && !nameMatches
                  ? "name-confirm-error"
                  : undefined
              }
              className={cn(
                "h-11",
                nameConfirmation.length > 0 && !nameMatches
                  ? "border-danger focus-visible:ring-danger/20"
                  : nameMatches && nameConfirmation.length > 0
                    ? "border-primary-400 focus-visible:ring-primary-400/20"
                    : "",
              )}
            />
            {nameConfirmation.length > 0 && !nameMatches && (
              <p
                id="name-confirm-error"
                role="alert"
                className="text-xs text-danger"
              >
                O nome não coincide com o informado no formulário.
              </p>
            )}
          </div>

          <div
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border transition-colors",
              agreed
                ? "border-primary-300 bg-primary-50"
                : "border-neutral-200 bg-white",
              !hasScrolled && "opacity-50 pointer-events-none",
            )}
          >
            <input
              id="consent-checkbox"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={!hasScrolled || isSubmitting}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500 flex-shrink-0 cursor-pointer"
              aria-describedby="consent-checkbox-label"
            />
            <label
              id="consent-checkbox-label"
              htmlFor="consent-checkbox"
              className="text-xs text-neutral-700 leading-relaxed cursor-pointer select-none"
            >
              Li e compreendi o Termo de Consentimento e, na qualidade de
              responsável legal,{" "}
              <strong className="font-semibold text-neutral-900">
                consinto livremente
              </strong>{" "}
              com o tratamento dos dados do(a) atleta{" "}
              <strong className="font-semibold">{athleteName}</strong> para os
              fins descritos.
            </label>
          </div>

          {error && (
            <p
              className="text-sm text-danger flex items-center gap-1.5"
              role="alert"
            >
              <AlertTriangle
                size={14}
                className="flex-shrink-0"
                aria-hidden="true"
              />
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              className={cn(
                "flex-1",
                canSubmit
                  ? "bg-primary-500 hover:bg-primary-600 text-white"
                  : "bg-neutral-200 text-neutral-400 cursor-not-allowed",
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  Registando…
                </>
              ) : (
                "Confirmar e Aceitar"
              )}
            </Button>
          </div>

          <p className="text-[0.625rem] text-neutral-400 text-center leading-relaxed">
            O aceite será registado com data/hora, endereço IP e versão do
            documento. Este registo é imutável e auditorável (LGPD, Art. 14).
          </p>
        </div>
      </div>
    </div>
  );
}
