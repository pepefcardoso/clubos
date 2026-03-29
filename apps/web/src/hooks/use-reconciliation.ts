"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  uploadOfxFile,
  matchOfxTransactions,
  confirmReconciliationMatch,
  ReconciliationApiError,
  type ParsedOfxStatement,
  type MatchResponse,
  type TransactionMatchResult,
  type ConfirmMatchPayload,
} from "@/lib/api/reconciliation";
import { CHARGES_QUERY_KEY } from "@/hooks/use-charges";

export type ReconciliationStep = "upload" | "matching" | "review" | "done";

/**
 * Payment method override per-fitId.
 * The user can change the method from the default PIX in the review step.
 */
export type MethodOverride = Record<
  string,
  "PIX" | "CASH" | "BANK_TRANSFER" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO"
>;

export function useReconciliation() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState<ReconciliationStep>("upload");
  const [statement, setStatement] = useState<ParsedOfxStatement | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResponse | null>(null);

  /**
   * fitId → chargeId override map.
   * Set when the user manually resolves an ambiguous or unmatched entry.
   */
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  /**
   * fitId → method override map.
   * Defaults to PIX for all. User can change per-row.
   */
  const [methodOverrides, setMethodOverrides] = useState<MethodOverride>({});

  /**
   * fitIds that the user has checked for confirmation.
   * Pre-populated with all "matched" fitIds after the match step.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /** Number of successfully confirmed payments in the done step. */
  const [confirmedCount, setConfirmedCount] = useState(0);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return uploadOfxFile(file, token);
    },
    onSuccess: async (parsed) => {
      setStatement(parsed);
      setStep("matching");

      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Não autenticado");
        const result = await matchOfxTransactions(parsed.transactions, token);
        setMatchResult(result);

        const preSelected = new Set(
          result.matches
            .filter((m) => m.matchStatus === "matched")
            .map((m) => m.fitId),
        );
        setSelected(preSelected);

        setStep("review");
      } catch (err) {
        if (err instanceof ReconciliationApiError) {
          throw err;
        }
        throw err;
      }
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (payload: ConfirmMatchPayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return confirmReconciliationMatch(payload, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHARGES_QUERY_KEY });
    },
  });

  const setChargeOverride = (fitId: string, chargeId: string) => {
    setOverrides((prev) => ({ ...prev, [fitId]: chargeId }));
  };

  const clearChargeOverride = (fitId: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[fitId];
      return next;
    });
  };

  const setMethodOverride = (fitId: string, method: MethodOverride[string]) => {
    setMethodOverrides((prev) => ({ ...prev, [fitId]: method }));
  };

  const toggleSelected = (fitId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fitId)) {
        next.delete(fitId);
      } else {
        next.add(fitId);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (!matchResult) return;
    const confirmable = matchResult.matches.filter(
      (m) => getEffectiveChargeId(m) !== null,
    );
    setSelected(new Set(confirmable.map((m) => m.fitId)));
  };

  const deselectAll = () => setSelected(new Set());

  const getEffectiveChargeId = (
    match: TransactionMatchResult,
  ): string | null => {
    if (overrides[match.fitId]) return overrides[match.fitId]!;
    if (match.matchStatus === "matched")
      return match.candidates[0]?.chargeId ?? null;
    return null;
  };

  const getEffectiveMethod = (fitId: string): MethodOverride[string] => {
    return methodOverrides[fitId] ?? "PIX";
  };

  const confirmAll = async (): Promise<void> => {
    if (!matchResult) return;

    const toConfirm = matchResult.matches.filter(
      (m) => selected.has(m.fitId) && getEffectiveChargeId(m) !== null,
    );

    let count = 0;
    for (const match of toConfirm) {
      const chargeId = getEffectiveChargeId(match)!;
      await confirmMutation.mutateAsync({
        fitId: match.fitId,
        chargeId,
        paidAt: match.transaction.postedAt,
        method: getEffectiveMethod(match.fitId),
      });
      count++;
    }

    setConfirmedCount(count);
    setStep("done");
  };

  const reset = () => {
    setStep("upload");
    setStatement(null);
    setMatchResult(null);
    setOverrides({});
    setMethodOverrides({});
    setSelected(new Set());
    setConfirmedCount(0);
  };

  return {
    step,
    statement,
    matchResult,
    overrides,
    methodOverrides,
    selected,
    confirmedCount,
    uploadMutation,
    confirmMutation,
    setChargeOverride,
    clearChargeOverride,
    setMethodOverride,
    toggleSelected,
    selectAll,
    deselectAll,
    getEffectiveChargeId,
    getEffectiveMethod,
    confirmAll,
    reset,
    isConfirming: confirmMutation.isPending,
  };
}
