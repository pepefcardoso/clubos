"use client";

import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGenerateCharges } from "@/hooks/use-charges";
import { ApiError } from "@/lib/api/charges";
import { Spinner } from "../ui/spinner";

interface GenerateChargesButtonProps {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

/**
 * Triggers manual charge generation for the current month.
 * Summarises generated / skipped counts into a toast message.
 * Distinguishes between:
 *   - 422: club has no active plan (surfaces the API message directly)
 *   - Partial failures: error count appended to success summary
 *   - Full failure: error toast with API message or generic fallback
 */
export function GenerateChargesButton({
  onSuccess,
  onError,
}: GenerateChargesButtonProps) {
  const mutation = useGenerateCharges();

  const handleClick = async () => {
    try {
      const result = await mutation.mutateAsync({});

      const parts: string[] = [];
      if (result.generated > 0)
        parts.push(
          `${result.generated} cobrança${result.generated !== 1 ? "s" : ""} gerada${result.generated !== 1 ? "s" : ""}`,
        );
      if (result.skipped > 0)
        parts.push(
          `${result.skipped} ignorada${result.skipped !== 1 ? "s" : ""} (já existia)`,
        );

      const summary =
        parts.length > 0 ? parts.join(", ") + "." : "Nenhuma cobrança nova.";

      const errorCount = result.errors.length + result.gatewayErrors.length;
      if (errorCount > 0) {
        onError(
          `${summary} ${errorCount} erro${errorCount !== 1 ? "s" : ""} — verifique o log.`,
        );
      } else {
        onSuccess(summary);
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Não foi possível gerar cobranças. Tente novamente.";
      onError(message);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={mutation.isPending}
      data-testid="generate-charges-btn"
    >
      {mutation.isPending ? (
        <>
          <Spinner />
          Gerando…
        </>
      ) : (
        <>
          <Zap size={15} aria-hidden="true" />
          Gerar cobranças
        </>
      )}
    </Button>
  );
}
